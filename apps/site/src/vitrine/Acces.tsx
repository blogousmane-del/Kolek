import { Rosace } from '@kolek/ui';

import { entree, useAnimations } from './animation';
import { APP_ADMIN, APP_COLLECTEUR, INSCRIPTION } from './liens';

/**
 * La section Accès — la porte, et non la promesse d'une porte.
 *
 * C'est l'ajout du 2026-08-23. La vitrine décrivait le produit et proposait
 * d'écrire un courriel ; elle n'offrait aucun chemin vers l'application, alors
 * qu'un collecteur déjà client arrive sur cette page pour une seule raison —
 * ouvrir sa tournée. Il devait deviner l'adresse.
 *
 * Trois entrées, dans l'ordre de fréquence réelle : le collecteur qui se
 * connecte tous les matins, celui qui n'a pas encore de compte, et
 * l'administration GTCS.
 */

function FlecheEntrante() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className="h-4 w-4 shrink-0 transition-transform duration-300 group-hover:translate-x-1"
    >
      <path
        d="M5 12h13M13 6l6 6-6 6"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function LogoGoogle() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="h-4 w-4 shrink-0">
      <path
        fill="#4285F4"
        d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.8Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.2 0 5.9-1.1 7.9-2.9l-3.9-3a7.2 7.2 0 0 1-10.7-3.8h-4v3.1A12 12 0 0 0 12 24Z"
      />
      <path fill="#FBBC05" d="M5.3 14.3a7.1 7.1 0 0 1 0-4.6v-3.1h-4a12 12 0 0 0 0 10.8l4-3.1Z" />
      <path
        fill="#EA4335"
        d="M12 4.8c1.8 0 3.4.6 4.6 1.8l3.5-3.5A12 12 0 0 0 1.3 6.6l4 3.1A7.2 7.2 0 0 1 12 4.8Z"
      />
    </svg>
  );
}

export function Acces() {
  const ref = useAnimations<HTMLElement>((conteneur) => {
    entree('[data-porte]', {
      stagger: 0.15,
      scrollTrigger: { trigger: conteneur, start: 'top 75%' },
    });
  });

  return (
    <section
      id="acces"
      ref={ref}
      className="relative overflow-hidden bg-sidebar px-5 py-20 sm:px-12 sm:py-24 lg:px-20"
    >
      <Rosace
        petales={24}
        excentricite={0.35}
        animee
        className="pointer-events-none absolute -left-[15%] top-1/2 w-[60vmin] -translate-y-1/2 text-or/10"
      />

      <div className="relative z-10">
        {/* Sans sur-titre. « ACCÈS » en monospace espacé au-dessus de « Ouvre ta
            tournée » disait deux fois la même chose, et c'était le quatrième de la
            page. Trois suffisent à marquer un argumentaire ; au-delà, l'étiquette
            cesse d'être une structure et devient un tic. */}
        <h2 className="mb-3 max-w-2xl font-headings text-3xl font-bold text-white sm:text-4xl">
          Ouvre ta tournée
        </h2>
        <p className="mb-12 max-w-xl font-body text-base text-white/50">
          Ton compte t’attend. Encaisse tes clients, rapproche ta caisse, clôture tes cartes,
          depuis le téléphone que tu as déjà dans la poche.
        </p>

        <div className="grid gap-5 lg:grid-cols-3">
          {/* La porte principale. Plus grande, en or : c'est le geste que le
              visiteur de retour vient faire, et il ne doit pas le chercher. */}
          <a
            data-porte
            href={APP_COLLECTEUR}
            className="group flex flex-col justify-between rounded-[2rem] bg-or p-7 text-dark-canvas shadow-lg transition-transform duration-300 hover:-translate-y-1 lg:col-span-2"
          >
            <div>
              {/* Les trois étiquettes de cette section étaient en monospace
                  majuscule espacé. Trois d'affilée, c'est le tic ; ce qu'elles
                  portent — à qui chaque porte s'adresse — est réel et reste, en
                  typographie de texte. */}
              <p className="mb-2 font-body text-sm font-semibold text-dark-canvas/75">
                J’ai déjà un compte
              </p>
              <h3 className="mb-3 font-headings text-3xl font-bold sm:text-4xl">
                Ouvrir mon espace collecteur
              </h3>
              <p className="max-w-md font-body text-sm leading-relaxed text-dark-canvas/70">
                Mot de passe, ou connexion Google en un clic si ton compte Kolek utilise ton
                adresse Gmail.
              </p>
            </div>
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <span className="inline-flex items-center gap-2 rounded-pill bg-dark-canvas px-5 py-2.5 font-body text-sm font-semibold text-or">
                Se connecter
                <FlecheEntrante />
              </span>
              <span className="inline-flex items-center gap-2 rounded-pill bg-white px-4 py-2.5 font-body text-sm font-medium text-ink">
                <LogoGoogle />
                en 1 clic
              </span>
            </div>
          </a>

          <div className="flex flex-col gap-5">
            <a
              data-porte
              href={INSCRIPTION}
              className="group flex-1 rounded-[2rem] border border-white/10 bg-white/[0.04] p-6 transition-transform duration-300 hover:-translate-y-1"
            >
              <p className="mb-2 font-body text-sm font-semibold text-white/55">
                Pas encore de compte
              </p>
              <h3 className="mb-2 font-headings text-xl font-bold text-white">
                Ouvrir un compte
              </h3>
              <p className="mb-4 font-body text-sm leading-relaxed text-white/50">
                Laisse ton nom et ton numéro. GTCS te rappelle, ouvre ton compte, et tu encaisses
                dès le lendemain.
              </p>
              <span className="inline-flex items-center gap-2 font-body text-sm font-semibold text-or">
                Remplir le formulaire
                <FlecheEntrante />
              </span>
            </a>

            {/* L'administration n'est pas dans la navigation : elle ne
                s'adresse pas aux visiteurs. La nommer ici, sans la vanter,
                vaut mieux que la cacher — celui qui en a besoin la cherche,
                et l'obscurité n'a jamais protégé une page de connexion. */}
            <a
              data-porte
              href={APP_ADMIN}
              className="group rounded-[2rem] border border-white/10 bg-white/[0.02] p-6 transition-transform duration-300 hover:-translate-y-1"
            >
              <p className="mb-2 font-body text-sm font-semibold text-white/55">Équipe GTCS</p>
              <span className="inline-flex items-center gap-2 font-body text-sm font-medium text-white/60">
                Administration
                <FlecheEntrante />
              </span>
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
