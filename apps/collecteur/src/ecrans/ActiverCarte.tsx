import { Bouton } from '@kolek/ui';
import { useEffect, useState } from 'react';

import { ouvrirCarte } from '../ecritures';
import { supabase } from '../supabase';
import { ChoixMise } from './ChoixMise';

/**
 * Ouvrir une carte de plus, sans toucher à celle qui est pleine.
 *
 * C'est la seconde porte du carrefour de fin de cycle. La première rend l'argent
 * et clôture ; celle-ci laisse le solde chez le collecteur et rouvre un cycle.
 * Rien à inventer en base pour cela : une carte à 31/31 reste `active` et refuse
 * simplement d'en prendre davantage, donc son solde reste dû tant qu'aucun
 * retrait n'a eu lieu.
 *
 * Le bloc est replié par défaut. Déplié, il montre le montant et demande une
 * confirmation : ouvrir une carte engage une commission — la première mise du
 * nouveau cycle — et cela ne se déclenche pas d'un doigt qui glisse.
 *
 * Un fichier à part pour trois appelants : la liste des clients, la fiche, et
 * l'écran de retrait. Écrit trois fois, il divergerait à la première correction.
 */
export function ActiverCarte({
  clientId,
  misePreremplie,
  identifiant,
  onOuverte,
}: {
  clientId: string;
  /** Le montant de la carte qui vient d'être remplie. Proposé, pas imposé. */
  misePreremplie: number;
  /** Préfixe des `id` du choix de mise : deux blocs peuvent coexister. */
  identifiant: string;
  onOuverte: () => void;
}) {
  const [deplie, setDeplie] = useState(false);
  const [mise, setMise] = useState(misePreremplie);
  const [collecteurId, setCollecteurId] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    // `collecteur_id` accompagne l'écriture : la politique RLS l'exige au
    // `with check`. Même lecture que dans `FicheClient` — la faire passer à
    // travers cinq composants pour un usage unique coûte plus qu'une lecture
    // de session.
    void supabase.auth.getUser().then(({ data }) => setCollecteurId(data.user?.id ?? null));
  }, []);

  async function ouvrir() {
    if (!collecteurId) return;
    setEnvoi(true);
    setErreur(null);
    const resultat = await ouvrirCarte(collecteurId, clientId, mise);
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
      <p className="font-body text-sm text-ink m-0">
        La carte pleine reste ouverte, et son solde reste dû au client.
      </p>

      <ChoixMise mise={mise} onChoisir={setMise} identifiant={identifiant} />

      {erreur && (
        <p role="alert" className="font-body text-sm text-negative m-0">
          {erreur}
        </p>
      )}

      <div className="flex gap-2">
        <Bouton onClick={ouvrir} disabled={envoi || collecteurId === null}>
          {envoi ? 'Ouverture…' : 'Ouvrir la carte'}
        </Bouton>
        <Bouton variante="contour" onClick={() => setDeplie(false)}>
          Annuler
        </Bouton>
      </div>
    </div>
  );
}
