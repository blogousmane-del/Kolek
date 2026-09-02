import { Onde, Rosace } from "@kolek/ui";

import { gsap, useAnimations } from "./animation";
import { APP_COLLECTEUR, INSCRIPTION } from "./liens";
import { Telephone } from "./Telephone";

/**
 * Le plan d'ouverture.
 *
 * Un billet de banque en pleine nuit : fond dégradé vert coffre, rosace
 * guillochée en or à droite — là où un billet met son filigrane — et le titre
 * poussé au tiers inférieur gauche. Le contraste typographique fait le
 * travail : « L'épargne du marché rencontre » en Sora, « la précision. » en
 * Bodoni Moda italique, or.
 *
 * C'est le seul titre de tout le produit qui mélange deux familles, et le
 * mélange y est le sujet : un Didone gravé est la typographie des coupures de
 * banque, comme la rosace en est la gravure et le 31 la valeur faciale.
 * Partout ailleurs, un mot s'emphase dans sa propre famille — voir § 3.2 du
 * système de design.
 *
 * Le chiffre 31 en fond n'est pas décoratif : c'est la valeur faciale du
 * produit — les 31 cases de la carte de collecte, la règle que tout le
 * moteur de calcul applique.
 */
export function Hero() {
  const ref = useAnimations<HTMLElement>((conteneur) => {
    const chrono = gsap.timeline({ delay: 0.15 });

    // L'ouverture, en trois temps qui se chevauchent. Une timeline plutôt que
    // trois tweens indépendants : c'est le chevauchement qui donne le poids —
    // trois entrées strictement séquentielles se lisent comme un diaporama.
    chrono
      .from("[data-entree]", {
        y: 40,
        opacity: 0,
        duration: 1,
        ease: "power3.out",
        stagger: 0.08,
      })
      // Le filigrane arrive après le texte, en s'ouvrant : sur un billet, la
      // gravure est sous l'encre, pas devant.
      .from(
        "[data-filigrane]",
        { scale: 0.85, opacity: 0, duration: 1.6, ease: "power2.out" },
        "-=1.1",
      )
      .from(
        "[data-faciale]",
        { opacity: 0, duration: 2, ease: "none" },
        "-=1.4",
      );

    // Le reflet or qui traverse le mot « précision », une fois. C'est le seul
    // moment de la page où l'or bouge de lui-même — le réserver au mot que la
    // marque revendique lui garde sa valeur.
    chrono.fromTo(
      "[data-reflet]",
      { backgroundPosition: "-150% 0" },
      { backgroundPosition: "250% 0", duration: 1.8, ease: "power2.inOut" },
      "-=0.6",
    );

    // Parallaxe de sortie : le hero s'enfonce pendant que la page monte.
    gsap.to("[data-parallaxe-hero]", {
      yPercent: 22,
      opacity: 0.35,
      ease: "none",
      scrollTrigger: {
        trigger: conteneur,
        start: "top top",
        end: "bottom top",
        scrub: true,
      },
    });
  });

  return (
    <header
      ref={ref}
      className="relative flex min-h-dvh flex-col justify-end overflow-hidden bg-[image:var(--degrade-hero)]"
    >
      {/* Filigrane : la rosace, hors cadre à droite comme sur une coupure. */}
      <Rosace
        petales={22}
        excentricite={0.38}
        animee
        data-filigrane
        className="pointer-events-none absolute -right-[12%] top-1/2 w-[70vmin] -translate-y-1/2 text-or/25"
      />
      {/* Valeur faciale. */}
      <p
        aria-hidden
        data-faciale
        className="pointer-events-none absolute right-[4%] top-[8%] font-headings text-[34vw] font-bold leading-none text-white/[0.04] sm:text-[26rem]"
      >
        31
      </p>
      {/* Bande de sécurité en pied. */}
      <Onde
        lignes={10}
        className="pointer-events-none absolute bottom-0 left-0 h-40 w-full text-or/15"
      />

      {/* Deux colonnes à partir de `lg`, une seule en dessous. Le téléphone
          n'apparaît pas sur petit écran : le visiteur en tient un dans la main,
          lui en dessiner un second ne lui apprend rien et coûterait la moitié
          de la hauteur du titre. */}
      <div
        data-parallaxe-hero
        className="relative z-10 grid items-end gap-12 px-5 pb-20 pt-32 sm:px-12 sm:pb-24 sm:pt-32 lg:grid-cols-[minmax(0,1fr)_auto] lg:gap-16 lg:px-20"
      >
        <div>
          {/* Il y avait ici un sur-titre — « ABIDJAN · CÔTE D'IVOIRE » en
              monospace espacé, avec un point qui clignotait. Retiré le
              2026-09-02 : il n'annonçait aucune section, le point ne signalait
              aucun état, et le pied de page dit déjà où Kolek est construit. */}
          <h1 className="max-w-4xl">
            <span
              data-entree
              className="block font-headings text-2xl font-bold leading-tight text-white xs:text-3xl sm:text-5xl"
            >
              L’épargne du marché rencontre
            </span>
            {/* Le reflet est peint par un dégradé porté par le texte lui-même
              (`background-clip: text`), pas par un calque au-dessus : un calque
              en `mix-blend-mode` coûte une couche de composition permanente, et
              cette page tourne sur des téléphones d'entrée de gamme. */}
            {/* `leading-[1.12]` et `pb-2`, pas `leading-[0.95]` : l'italique de
              Bodoni descend bas, et le `p` de « précision » — le mot que la
              marque revendique — était rogné par sa propre ligne de base. */}
            <span
              data-entree
              data-reflet
              className="reflet-or mt-1 block pb-2 font-drama text-7xl italic leading-[1.12] sm:text-[9rem]"
            >
              la précision.
            </span>
          </h1>

          <p
            data-entree
            className="mt-5 max-w-xl font-body text-base leading-relaxed text-white/70 sm:mt-6 sm:text-lg"
          >
            Chaque mise comptée, chaque caisse rapprochée le soir, chaque franc
            tracé. L’argent, lui, ne quitte jamais ta main.
          </p>

          {/* Aucun des deux ne mène à une boîte aux lettres. Avant le
            2026-08-23 ils pointaient sur un `mailto:` : sur une machine sans
            client de messagerie configuré, cliquer ne produisait rien de
            visible, et un bouton qui ne produit rien de visible est un bouton
            cassé, quoi qu'en dise le code.

            Le 2026-09-02, les rôles ont été échangés. « Ouvrir mon espace
            collecteur » était le bouton principal d'ici **et**, sous le nom
            « Se connecter », le bouton plein de la barre de navigation : deux
            poids, deux libellés, une seule destination, visibles ensemble. Une
            surface, un travail. La barre suit le visiteur partout et porte donc
            la connexion ; le hero ne se voit qu'une fois, à l'arrivée, et porte
            l'ouverture de compte. */}
          {/* Empilés et pleine largeur sur téléphone, côte à côte ensuite. Deux
            pilules de largeurs différentes posées l'une sous l'autre se lisent
            comme un défaut d'alignement ; à `w-full` elles forment une colonne
            franche, et la cible tactile occupe toute la largeur du pouce. */}
          <div
            data-entree
            className="mt-8 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:gap-4"
          >
            <a
              href={INSCRIPTION}
              className="magnetique overflow-hidden rounded-pill bg-or px-7 py-3.5 text-center font-body text-base font-semibold text-dark-canvas"
            >
              <span className="relative z-10">Ouvrir un compte</span>
              <span aria-hidden className="voile-or" />
            </a>
            <a
              href={APP_COLLECTEUR}
              className="rounded-pill border border-white/20 px-7 py-3.5 text-center font-body text-base font-medium text-white/80 transition-transform duration-300 hover:-translate-y-px hover:text-white"
            >
              J’ai déjà un compte
            </a>
          </div>
        </div>

        <div data-entree className="hidden lg:block lg:justify-self-end">
          <Telephone />
        </div>
      </div>

      {/* Sentinelle de la barre de navigation : quand elle sort, l'île se givre. */}
      <div
        id="fin-du-hero"
        aria-hidden
        className="absolute bottom-0 h-px w-full"
      />
    </header>
  );
}
