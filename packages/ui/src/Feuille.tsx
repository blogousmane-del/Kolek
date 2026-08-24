import { useEffect, useRef, type ReactNode } from 'react';

import { Icone } from './Icone';

/**
 * Le panneau flottant.
 *
 * Une feuille qui monte du bas sur téléphone, une boîte centrée sur écran
 * large. La forme change, le composant non : c'est le même contenu, et le
 * collecteur qui passe du terrain au bureau ne doit pas réapprendre où se
 * trouvent les commandes.
 *
 * ## Pourquoi une feuille plutôt qu'un écran
 *
 * La fiche d'un client s'ouvre depuis sa ligne, et on y revient. Un écran
 * plein remplacerait la liste, effacerait la position du défilement, et
 * obligerait à retrouver son client après chaque consultation — trente fois par
 * tournée. La feuille laisse la liste en place, derrière.
 *
 * ## Ce que ce composant prend en charge, et qu'on oublie toujours
 *
 * **Échap ferme.** Sans ça, la seule sortie est la croix, qu'il faut viser.
 *
 * **Le fond ne défile plus.** Sur téléphone, un panneau ouvert au-dessus d'une
 * page qui défile encore donne l'impression que l'écran a deux couches qui
 * bougent l'une sur l'autre. `overflow: hidden` sur `body` le temps de
 * l'ouverture.
 *
 * **Le voile est un vrai bouton.** Un `div` cliquable n'existe ni pour le
 * clavier ni pour un lecteur d'écran : la commande de fermeture disparaîtrait
 * pour ceux qui n'utilisent pas de souris.
 *
 * **Le focus entre.** À l'ouverture, le focus va sur le panneau ; sans ça, la
 * tabulation continue dans la liste cachée derrière, et Échap ne fonctionne
 * pas tant qu'on n'a rien cliqué.
 */
export function Feuille({
  titre,
  sousTitre,
  ouverte,
  onFermer,
  children,
}: {
  titre: string;
  sousTitre?: string;
  ouverte: boolean;
  onFermer: () => void;
  children: ReactNode;
}) {
  const panneau = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ouverte) return;

    const surTouche = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onFermer();
    };
    window.addEventListener('keydown', surTouche);

    // La valeur précédente est restaurée plutôt qu'écrasée par `''` : deux
    // panneaux imbriqués, ou une page qui bloquait déjà le défilement pour une
    // autre raison, ne doivent pas se le voir rendre par le premier qui ferme.
    const precedent = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    panneau.current?.focus();

    return () => {
      window.removeEventListener('keydown', surTouche);
      document.body.style.overflow = precedent;
    };
  }, [ouverte, onFermer]);

  if (!ouverte) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center sm:justify-center">
      <button
        type="button"
        aria-label="Fermer"
        onClick={onFermer}
        className="anim-voile absolute inset-0 bg-black/50 cursor-default"
      />

      <div
        ref={panneau}
        role="dialog"
        aria-modal="true"
        aria-label={titre}
        tabIndex={-1}
        className="anim-feuille relative z-10 w-full sm:max-w-liste max-h-[92dvh] sm:max-h-[85dvh] flex flex-col bg-surface rounded-t-2xl sm:rounded-2xl shadow-lg outline-none overflow-hidden"
      >
        {/* La poignée. Purement visuelle — elle ne se saisit pas — mais elle
            dit d'un coup d'œil que l'objet se referme vers le bas. */}
        <div className="sm:hidden pt-2 pb-1 flex justify-center shrink-0">
          <span className="w-10 h-1 rounded-pill bg-hairline" />
        </div>

        <div className="flex items-start justify-between gap-3 px-5 pt-3 pb-4 shrink-0">
          <div className="min-w-0">
            <h2 className="font-headings font-bold text-xl text-ink truncate m-0">{titre}</h2>
            {sousTitre && (
              <p className="font-body text-sm text-muted-foreground truncate mt-0.5">{sousTitre}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onFermer}
            aria-label="Fermer"
            className="anim-pression w-9 h-9 shrink-0 rounded-pill flex items-center justify-center cursor-pointer hover:bg-muted"
          >
            <Icone nom="x" taille={18} className="text-muted-foreground" />
          </button>
        </div>

        {/* Le contenu défile, l'en-tête reste. Sur un téléphone en paysage, la
            feuille fait 92 % de la hauteur : sans cette séparation, le titre
            sortirait du champ dès le premier geste de défilement. */}
        <div className="flex-1 overflow-y-auto px-5 pb-6 flex flex-col gap-4">{children}</div>
      </div>
    </div>
  );
}
