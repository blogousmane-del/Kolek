import type { ReactNode } from 'react';

import { Icone } from './Icone';

/**
 * Un repli natif, habillé aux jetons.
 *
 * `<details>` plutôt qu'un état React, et ce choix porte tout l'intérêt du
 * composant : le contenu reste dans le document, donc atteignable par un
 * lecteur d'écran et par la recherche du navigateur, et la visibilité revient
 * au navigateur.
 *
 * Un repli qui démonte ses enfants les fait disparaître pour tout le monde,
 * pas seulement pour l'œil. Deux épreuves d'écran lisent des libellés de
 * volumes à travers `getByTestId` : elles tomberaient, et elles auraient
 * raison de tomber.
 */
export function Repli({
  titre,
  children,
  ouvertParDefaut = false,
}: {
  titre: string;
  children: ReactNode;
  ouvertParDefaut?: boolean;
}) {
  return (
    <details open={ouvertParDefaut} className="group">
      {/* `list-none` retire le triangle natif ; le chevron le remplace et
          pivote à l’ouverture. `min-h-11` tient la cible tactile de 44 px. */}
      <summary className="flex items-center gap-2 min-h-11 cursor-pointer font-body text-sm font-medium text-muted-foreground list-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
        <Icone
          nom="chevron-right"
          taille={14}
          className="transition-transform group-open:rotate-90"
        />
        {titre}
      </summary>
      <div className="pt-3">{children}</div>
    </details>
  );
}
