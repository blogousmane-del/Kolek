import { useEffect, useState } from 'react';

import { APP_COLLECTEUR } from './liens';

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
    <nav
      className={`fixed left-1/2 top-4 z-40 flex -translate-x-1/2 items-center gap-1 rounded-pill py-2 pl-4 pr-2 transition-all duration-500 sm:pl-5 ${
        surLeHero
          ? 'bg-dark-canvas/30 backdrop-blur-sm'
          : 'border border-white/10 bg-dark-canvas/70 shadow-lg backdrop-blur-xl'
      }`}
    >
      <a href="#" className="mr-2 flex items-center gap-2 sm:mr-3" aria-label="Kolek — haut de page">
        <span className="flex h-7 w-7 items-center justify-center rounded-md bg-or">
          <span className="font-headings text-sm font-bold text-dark-canvas">K</span>
        </span>
        <span className="font-headings text-lg font-bold tracking-tight text-white">Kolek</span>
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
        href={APP_COLLECTEUR}
        className="magnetique ml-2 overflow-hidden rounded-pill bg-or px-4 py-2 font-body text-sm font-semibold text-dark-canvas"
      >
        <span className="relative z-10">Se connecter</span>
        <span aria-hidden className="voile-or" />
      </a>
    </nav>
  );
}
