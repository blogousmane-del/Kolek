import { useEffect, useState } from "react";

import { Icone, Logo, Marque } from "@kolek/ui";

import { APP_COLLECTEUR, INSCRIPTION } from "./liens";

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
 *
 * ## Le panneau replié, le 2026-09-02
 *
 * Les quatre liens de section étaient `hidden … md:block` **et rien ne les
 * remplaçait** : sous 768 px — c'est-à-dire sur le téléphone qui est la cible
 * déclarée du produit — il n'existait aucun moyen d'atteindre Produit,
 * Méthode, Tarifs ou Accès autrement qu'en faisant défiler toute la page.
 * Masquer une navigation sans en offrir une autre n'est pas une adaptation à
 * l'écran, c'est une navigation absente.
 */

const LIENS = [
  { href: "#produit", libelle: "Produit" },
  { href: "#methode", libelle: "Méthode" },
  { href: "#tarifs", libelle: "Tarifs" },
  { href: "#acces", libelle: "Accès" },
] as const;

export function Navbar() {
  const [surLeHero, setSurLeHero] = useState(true);
  const [deplie, setDeplie] = useState(false);

  useEffect(() => {
    const sentinelle = document.getElementById("fin-du-hero");
    if (!sentinelle) return;
    const observateur = new IntersectionObserver(
      ([entree]) => setSurLeHero(entree.isIntersecting),
      { rootMargin: "-80px 0px 0px 0px" },
    );
    observateur.observe(sentinelle);
    return () => observateur.disconnect();
  }, []);

  // `Échap` ferme. Un panneau qu'on ouvre au doigt se ferme aussi au clavier :
  // c'est le seul moyen d'en sortir pour qui navigue sans souris.
  useEffect(() => {
    if (!deplie) return;
    const auClavier = (evenement: KeyboardEvent) => {
      if (evenement.key === "Escape") setDeplie(false);
    };
    document.addEventListener("keydown", auClavier);
    return () => document.removeEventListener("keydown", auClavier);
  }, [deplie]);

  return (
    <>
      // `max-w` et `whitespace-nowrap` : sans eux, « Se connecter » passait sur
      // deux lignes sous 360 px, doublant la hauteur de la pilule — qui venait
      // alors couvrir le titre de la carte défilant dessous.
      <nav
        className={`fixed left-1/2 top-3 z-40 flex max-w-[calc(100vw-1.5rem)] -translate-x-1/2 items-center gap-1 rounded-pill py-1.5 pl-3 pr-1.5 transition-all duration-500 sm:top-4 sm:py-2 sm:pl-5 sm:pr-2 ${
          surLeHero
            ? "bg-dark-canvas/30 backdrop-blur-sm"
            : "border border-white/10 bg-dark-canvas/70 shadow-lg backdrop-blur-xl"
        }`}
      >
        <a
          href="#"
          className="mr-1.5 flex shrink-0 items-center gap-2 sm:mr-3"
          aria-label="Kolek — haut de page"
        >
          {/* Le mot disparaît sous 380 px : la pièce suffit à identifier la page,
            et les pixels rendus valent mieux pour la seule commande qui compte.
            Deux formes plutôt qu'une, parce que le mot est un tracé dans le même
            SVG que la pièce — on ne peut pas en masquer la moitié en CSS.
            `decoratif` : le lien porte déjà `aria-label`. */}
          <Marque decoratif className="h-7 w-7 shrink-0 xs:hidden" />
          <Logo decoratif className="hidden h-7 shrink-0 text-white xs:block" />
        </a>

        {/* Le dépliant. Il ne remplace pas les liens : il les rend atteignables
          là où ils ne tiennent pas. Au-dessus de `md`, les liens sont visibles
          et ce bouton n'existe pas. */}
        <button
          type="button"
          onClick={() => setDeplie((ouvert) => !ouvert)}
          aria-expanded={deplie}
          aria-controls="menu-vitrine"
          aria-label={deplie ? "Fermer le menu" : "Ouvrir le menu"}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-pill text-white/70 transition-colors hover:bg-white/10 hover:text-white md:hidden"
        >
          <Icone nom={deplie ? "x" : "menu"} taille={20} />
        </button>

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
      {/* Le voile. Sans lui, toucher à côté du panneau ne le referme pas — et
          c'est le premier geste que fait quelqu'un qui a changé d'avis. */}
      {deplie && (
        <button
          type="button"
          aria-hidden
          tabIndex={-1}
          onClick={() => setDeplie(false)}
          className="fixed inset-0 z-30 cursor-default md:hidden"
        />
      )}
      <div
        id="menu-vitrine"
        hidden={!deplie}
        className="fixed left-1/2 top-16 z-40 w-[calc(100vw-2rem)] max-w-xs -translate-x-1/2 rounded-[1.5rem] border border-white/10 bg-dark-canvas/95 p-2 shadow-lg backdrop-blur-xl md:hidden"
      >
        {LIENS.map((lien) => (
          <a
            key={lien.href}
            href={lien.href}
            onClick={() => setDeplie(false)}
            className="block rounded-[1rem] px-4 py-3 font-body text-base font-medium text-white/80 transition-colors hover:bg-white/5 hover:text-white"
          >
            {lien.libelle}
          </a>
        ))}
        <a
          href={INSCRIPTION}
          onClick={() => setDeplie(false)}
          className="block rounded-[1rem] px-4 py-3 font-body text-base font-semibold text-or transition-colors hover:bg-white/5 sm:hidden"
        >
          Ouvrir un compte
        </a>
      </div>
    </>
  );
}
