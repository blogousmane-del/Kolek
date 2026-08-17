import { Tarifs } from './ecrans/Tarifs';

/**
 * Le site public n'a qu'une page pour l'instant : la grille tarifaire. Pas de
 * routeur tant qu'il n'y a qu'une destination — on l'ajoutera avec la deuxième.
 */
export default function App() {
  return <Tarifs />;
}
