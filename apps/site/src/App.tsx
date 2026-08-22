import { Vitrine } from './vitrine/Vitrine';

/**
 * Le site public est la vitrine — une seule page, tout l'argumentaire.
 * L'ancienne page de tarifs (grille + faux tunnel de commande) a été absorbée :
 * la grille vit dans la section Adhésion de la vitrine, branchée sur les mêmes
 * `PALIERS` de `packages/core` ; le tunnel de démonstration a disparu, parce
 * qu'un paiement qui n'encaisse pas est une promesse cassée sur une page de
 * vente. Le vrai règlement arrive par Chariow, dans l'application collecteur.
 */
export default function App() {
  return <Vitrine />;
}
