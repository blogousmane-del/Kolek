import { Onde } from "@kolek/ui";

import { gsap, useAnimations } from "./animation";

/**
 * Le manifeste.
 *
 * Deux déclarations contrastées, révélées mot à mot au défilement. Le
 * découpage en mots est fait à la main plutôt qu'avec SplitText : le plugin
 * est payant, et couper sur les espaces suffit pour deux phrases.
 */

const NEUTRE =
  "La plupart des applications de microfinance se concentrent sur : déplacer l’argent.";
const NOTRE = ["Nous, sur :", "le compter", "juste."] as const;

function EnMots({ texte, className }: { texte: string; className?: string }) {
  return (
    <>
      {texte.split(" ").map((mot, i) => (
        <span key={i} data-mot className={`inline-block ${className ?? ""}`}>
          {mot}&nbsp;
        </span>
      ))}
    </>
  );
}

export function Philosophie() {
  const ref = useAnimations<HTMLElement>((conteneur) => {
    gsap.from("[data-mot]", {
      y: 30,
      opacity: 0,
      duration: 0.8,
      ease: "power3.out",
      stagger: 0.05,
      scrollTrigger: { trigger: conteneur, start: "top 65%" },
    });
    // La texture recule moins vite que le texte : la profondeur d'un billet
    // tenu à contre-jour.
    gsap.to("[data-parallaxe]", {
      yPercent: -18,
      ease: "none",
      scrollTrigger: {
        trigger: conteneur,
        start: "top bottom",
        end: "bottom top",
        scrub: true,
      },
    });
  });

  return (
    <section
      id="methode"
      ref={ref}
      className="relative overflow-hidden bg-dark-canvas px-5 py-24 sm:px-12 sm:py-32 lg:px-20"
    >
      <div
        data-parallaxe
        className="pointer-events-none absolute inset-x-0 top-1/4 h-[150%] text-or/10"
      >
        <Onde lignes={16} className="h-full w-full" />
      </div>

      <div className="relative z-10 mx-auto max-w-4xl">
        <p className="mb-10 font-body text-lg text-white/50 sm:text-xl">
          <EnMots texte={NEUTRE} />
        </p>
        {/* Même réserve que dans le hero : le `j` de « juste » touchait le bas
            de sa ligne. Voir § 3.2 du système de design. */}
        <p className="pb-2 font-drama text-5xl italic leading-[1.15] text-white sm:text-7xl">
          <span data-mot className="inline-block">
            {NOTRE[0]}&nbsp;
          </span>
          <span data-mot className="inline-block text-or">
            {NOTRE[1]}&nbsp;
          </span>
          <span data-mot className="inline-block text-or">
            {NOTRE[2]}
          </span>
        </p>

        <p
          data-mot
          className="mt-12 max-w-2xl font-body text-base leading-relaxed text-white/60"
        >
          Un banquier ambulant gère l’épargne de dizaines de familles avec un
          carnet et une mémoire. Le jour où l’un des deux flanche, c’est la
          confiance de tout un marché qui part avec. Kolek ne déplace pas cet
          argent : il le rend incontestable.
        </p>
      </div>
    </section>
  );
}
