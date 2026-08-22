import { CONTACT_DEMO } from './Navbar';
import { Onde, Rosace } from './texture';
import { entree, useAnimations } from './animation';

/**
 * Le plan d'ouverture.
 *
 * Un billet de banque en pleine nuit : fond dégradé vert coffre, rosace
 * guillochée en or à droite — là où un billet met son filigrane — et le titre
 * poussé au tiers inférieur gauche. Le contraste typographique fait le
 * travail : « L'épargne du marché rencontre » en Sora, « la précision. » en
 * serif italique massif, or.
 *
 * Le chiffre 31 en fond n'est pas décoratif : c'est la valeur faciale du
 * produit — les 31 cases de la carte de collecte, la règle que tout le
 * moteur de calcul applique.
 */
export function Hero() {
  const ref = useAnimations<HTMLElement>(() => {
    entree('[data-entree]', { delay: 0.15 });
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
        className="pointer-events-none absolute -right-[12%] top-1/2 w-[70vmin] -translate-y-1/2 text-or/25"
      />
      {/* Valeur faciale. */}
      <p
        aria-hidden
        className="pointer-events-none absolute right-[4%] top-[8%] font-headings text-[34vw] font-bold leading-none text-white/[0.04] sm:text-[26rem]"
      >
        31
      </p>
      {/* Bande de sécurité en pied. */}
      <Onde lignes={10} className="pointer-events-none absolute bottom-0 left-0 h-40 w-full text-or/15" />

      <div className="relative z-10 px-6 pb-24 pt-40 sm:px-12 lg:px-20">
        <p
          data-entree
          className="mb-5 inline-flex items-center gap-2 rounded-pill border border-or/30 px-4 py-1.5 font-mono text-xs tracking-widest text-or"
        >
          <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-pill bg-or" />
          ABIDJAN · CÔTE D’IVOIRE
        </p>

        <h1 className="max-w-4xl">
          <span data-entree className="block font-headings text-3xl font-bold leading-tight text-white sm:text-5xl">
            L’épargne du marché rencontre
          </span>
          <span
            data-entree
            className="mt-1 block font-drama text-7xl italic leading-[0.95] text-or sm:text-[9rem]"
          >
            la précision.
          </span>
        </h1>

        <p data-entree className="mt-6 max-w-xl font-body text-base leading-relaxed text-white/70 sm:text-lg">
          Kolek remplace le carnet du banquier ambulant par un téléphone : chaque mise comptée,
          chaque caisse rapprochée le soir, chaque franc tracé. L’argent, lui, ne quitte jamais
          ta main.
        </p>

        <div data-entree className="mt-8 flex flex-wrap items-center gap-4">
          <a
            href={CONTACT_DEMO}
            className="magnetique overflow-hidden rounded-pill bg-or px-7 py-3.5 font-body text-base font-semibold text-dark-canvas"
          >
            <span className="relative z-10">Demander une démo</span>
            <span aria-hidden className="voile-or" />
          </a>
          <a
            href="#produit"
            className="rounded-pill border border-white/20 px-7 py-3.5 font-body text-base font-medium text-white/80 transition-transform duration-300 hover:-translate-y-px hover:text-white"
          >
            Voir le produit
          </a>
        </div>
      </div>

      {/* Sentinelle de la barre de navigation : quand elle sort, l'île se givre. */}
      <div id="fin-du-hero" aria-hidden className="absolute bottom-0 h-px w-full" />
    </header>
  );
}
