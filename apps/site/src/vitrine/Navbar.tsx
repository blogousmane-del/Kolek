import { useEffect, useState } from 'react';

import { APP_COLLECTEUR, INSCRIPTION } from './liens';

/**
 * L'île flottante.
 *
 * Une pilule fixe, centrée, transparente sur le hero sombre puis givrée dès
 * qu'on le quitte. Le basculement est un `IntersectionObserver` sur une
 * sentinelle posée en bas du hero — pas un seuil de pixels en dur, qui se
 * décale à chaque changement de hauteur du hero.
 *
 * Le bouton de droite est passé de « Demander une démo » à « Se connecter » le
 * 2026-08-23. Le geste le plus fréquent sur cette page n'est pas celui d'un
 * prospect : c'est celui d'un collecteur déjà client qui vient ouvrir sa
 * tournée. C'est donc lui qui occupe la place la plus chère de l'écran.
 */

const LIENS = [
  { href: '#produit', libelle: 'Produit' },
  { href: '#methode', libelle: 'Méthode' },
  { href: '#tarifs', libelle: 'Tarifs' },
  { href: '#acces', libelle: 'Accès' },
] as const;

export function Navbar() {
  const [surLeHero, setSurLeHero] = useState(true);

  useEffect(() => {
    const sentinelle = document.getElementById('fin-du-hero');
    if (!sentinelle) return;
    const observateur = new IntersectionObserver(
      ([entree]) => setSurLeHero(entree.isIntersecting),
      { rootMargin: '-80px 0px 0px 0px' },
    );
    observateur.observe(sentinelle);
    return () => observateur.disconnect();
  }, []);

  return (
    // `max-w` et `whitespace-nowrap` : sans eux, « Se connecter » passait sur
    // deux lignes sous 360 px, doublant la hauteur de la pilule — qui venait
    // alors couvrir le titre de la carte défilant dessous.
    <nav
      className={`fixed left-1/2 top-3 z-40 flex max-w-[calc(100vw-1.5rem)] -translate-x-1/2 items-center gap-1 rounded-pill py-1.5 pl-3 pr-1.5 transition-all duration-500 sm:top-4 sm:py-2 sm:pl-5 sm:pr-2 ${
        surLeHero
          ? 'bg-dark-canvas/30 backdrop-blur-sm'
          : 'border border-white/10 bg-dark-canvas/70 shadow-lg backdrop-blur-xl'
      }`}
    >
      <a
        href="#"
        className="mr-1.5 flex shrink-0 items-center gap-2 sm:mr-3"
        aria-label="Kolek — haut de page"
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-or">
          <span className="font-headings text-sm font-bold text-dark-canvas">K</span>
        </span>
        {/* Le mot disparaît sous 380 px : le logo suffit à identifier la page,
            et les pixels rendus valent mieux pour la seule commande qui compte. */}
        <span className="hidden font-headings text-lg font-bold tracking-tight text-white xs:inline">
          Kolek
        </span>
      </a>

      {LIENS.map((lien) => (
        <a
          key={lien.href}
          href={lien.href}
          className="hidden rounded-pill px-3 py-1.5 font-body text-sm font-medium text-white/70 transition-transform duration-300 hover:-translate-y-px hover:text-white md:block"
        >
          {lien.libelle}
        </a>
      ))}

      <a
        href={INSCRIPTION}
        className="hidden rounded-pill px-3 py-1.5 font-body text-sm font-medium text-or transition-transform duration-300 hover:-translate-y-px sm:block"
      >
        Ouvrir un compte
      </a>
      <a
        href={APP_COLLECTEUR}
        className="magnetique ml-1 shrink-0 overflow-hidden whitespace-nowrap rounded-pill bg-or px-3.5 py-2 font-body text-sm font-semibold text-dark-canvas sm:px-4"
      >
        <span className="relative z-10">Se connecter</span>
        <span aria-hidden className="voile-or" />
      </a>
    </nav>
  );
}
