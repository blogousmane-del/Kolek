import { useEffect, useState } from 'react';

/**
 * L'île flottante.
 *
 * Une pilule fixe, centrée, transparente sur le hero sombre puis givrée dès
 * qu'on le quitte. Le basculement est un `IntersectionObserver` sur une
 * sentinelle posée en bas du hero — pas un seuil de pixels en dur, qui se
 * décale à chaque changement de hauteur du hero.
 */

const LIENS = [
  { href: '#produit', libelle: 'Produit' },
  { href: '#methode', libelle: 'Méthode' },
  { href: '#tarifs', libelle: 'Tarifs' },
] as const;

/** Le contact de démonstration. Une adresse plutôt qu'un formulaire : la CSP
    de ce site dit `form-action 'none'` et `connect-src 'self'` — aucune donnée
    ne quitte cette page, et c'est un argument de vente autant qu'un réglage. */
export const CONTACT_DEMO = 'mailto:gsmtechnoloy@gmail.com?subject=Kolek%20—%20demande%20de%20démo';

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
      className={`fixed left-1/2 top-4 z-40 flex -translate-x-1/2 items-center gap-1 rounded-pill py-2 pl-5 pr-2 transition-all duration-500 ${
        surLeHero
          ? 'bg-transparent'
          : 'border border-white/10 bg-dark-canvas/60 shadow-lg backdrop-blur-xl'
      }`}
    >
      <a href="#" className="mr-3 flex items-center gap-2" aria-label="Kolek — haut de page">
        <span className="flex h-7 w-7 items-center justify-center rounded-md bg-or">
          <span className="font-headings text-sm font-bold text-dark-canvas">K</span>
        </span>
        <span className="font-headings text-lg font-bold tracking-tight text-white">Kolek</span>
      </a>

      {LIENS.map((lien) => (
        <a
          key={lien.href}
          href={lien.href}
          className="hidden rounded-pill px-3 py-1.5 font-body text-sm font-medium text-white/70 transition-transform duration-300 hover:-translate-y-px hover:text-white sm:block"
        >
          {lien.libelle}
        </a>
      ))}

      <a
        href={CONTACT_DEMO}
        className="magnetique ml-2 overflow-hidden rounded-pill bg-or px-4 py-2 font-body text-sm font-semibold text-dark-canvas"
      >
        <span className="relative z-10">Demander une démo</span>
        <span aria-hidden className="voile-or" />
      </a>
    </nav>
  );
}
