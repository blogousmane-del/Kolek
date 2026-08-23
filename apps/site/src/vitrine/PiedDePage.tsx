import { APP_COLLECTEUR, CONTACT_DEMO } from './liens';

/**
 * Le pied de page.
 *
 * L'indicateur « Système opérationnel » n'est pas branché sur une sonde — la
 * CSP de cette page interdit tout appel sortant, et c'est très bien ainsi. Il
 * dit ce que la page sait dire : le site est servi, donc l'infrastructure qui
 * le sert répond. Pas plus.
 */

const COLONNES = [
  {
    titre: 'Produit',
    liens: [
      { href: '#produit', libelle: 'Les trois instruments' },
      { href: '#methode', libelle: 'La méthode' },
      { href: '#tarifs', libelle: 'Tarifs' },
    ],
  },
  {
    titre: 'Accès',
    liens: [
      { href: APP_COLLECTEUR, libelle: 'Espace collecteur' },
      { href: '#acces', libelle: 'Toutes les entrées' },
      { href: CONTACT_DEMO, libelle: 'Demander une démo' },
    ],
  },
] as const;

export function PiedDePage() {
  return (
    <footer className="rounded-t-[4rem] bg-dark-canvas px-6 pb-10 pt-16 sm:px-12 lg:px-20">
      <div className="grid gap-10 md:grid-cols-3">
        <div>
          <p className="mb-2 flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-or">
              <span className="font-headings text-sm font-bold text-dark-canvas">K</span>
            </span>
            <span className="font-headings text-xl font-bold text-white">Kolek</span>
          </p>
          <p className="max-w-xs font-body text-sm leading-relaxed text-white/50">
            L’épargne du marché, enfin sécurisée. Un produit GTCS, construit à Abidjan pour les
            banquiers ambulants de Côte d’Ivoire.
          </p>
        </div>

        {COLONNES.map((colonne) => (
          <nav key={colonne.titre} aria-label={colonne.titre}>
            <p className="mb-3 font-mono text-xs tracking-widest text-white/40">
              {colonne.titre.toUpperCase()}
            </p>
            <ul className="flex flex-col gap-2">
              {colonne.liens.map((lien) => (
                <li key={lien.libelle}>
                  <a
                    href={lien.href}
                    className="font-body text-sm text-white/60 transition-transform duration-300 hover:-translate-y-px hover:text-white"
                  >
                    {lien.libelle}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>

      <div className="mt-12 flex flex-wrap items-center justify-between gap-4 border-t border-white/8 pt-6">
        <p className="font-body text-xs text-white/30">
          © {new Date().getFullYear()} GTCS — Kolek. Aucun flux d’épargne ne transite par cette
          page.
        </p>
        <p className="flex items-center gap-2 font-mono text-xs text-white/40">
          <span className="inline-block h-2 w-2 animate-pulse rounded-pill bg-positive" />
          SYSTÈME OPÉRATIONNEL
        </p>
      </div>
    </footer>
  );
}
