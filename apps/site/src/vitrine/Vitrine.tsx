import { Bruit } from '@kolek/ui';

import { Acces } from './Acces';
import { Fonctionnalites } from './Fonctionnalites';
import { Hero } from './Hero';
import { Navbar } from './Navbar';
import { Philosophie } from './Philosophie';
import { PiedDePage } from './PiedDePage';
import { Protocole } from './Protocole';
import { Tarification } from './Tarification';

/**
 * La vitrine — la page de vente de Kolek, reconstruite le 2026-08-22.
 *
 * Direction : « Vert Monétaire ». Le vert profond du produit traité comme un
 * billet de banque — guilloches, or champagne, valeur faciale — parce que la
 * promesse du produit est exactement celle d'une coupure : ce qui est écrit
 * dessus est ce qu'elle vaut.
 *
 * L'ordre des sections suit l'argumentaire, pas l'inverse : l'ouverture pose
 * la promesse, le produit la montre en fonctionnement, le manifeste la
 * justifie, le protocole la détaille, la grille la chiffre.
 */
export function Vitrine() {
  return (
    <div className="overflow-x-clip bg-canvas">
      <Bruit />
      <Navbar />
      <Hero />
      <Fonctionnalites />
      <Philosophie />
      <Protocole />
      <Tarification />
      <Acces />
      <PiedDePage />
    </div>
  );
}
