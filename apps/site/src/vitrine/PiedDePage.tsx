import { Logo } from '@kolek/ui';

import { APP_COLLECTEUR, CONTACT_DEMO, INSCRIPTION } from './liens';

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
      { href: INSCRIPTION, libelle: 'Ouvrir un compte' },
      { href: CONTACT_DEMO, libelle: 'Écrire à GTCS' },
    ],
  },
] as const;

export function PiedDePage() {
  return (
    <footer className="rounded-t-[2rem] bg-dark-canvas sm:rounded-t-[4rem] px-5 pb-10 pt-16 sm:px-12 lg:px-20">
      <div className="grid gap-10 md:grid-cols-3">
        <div>
          <Logo className="mb-2 h-9 text-white" />
          <p className="max-w-xs font-body text-sm leading-relaxed text-white/50">
            L’épargne du marché, enfin sécurisée. Un produit GTCS, construit à Abidjan pour les
            banquiers ambulants de Côte d’Ivoire.
          </p>
        </div>

        {COLONNES.map((colonne) => (
          <nav key={colonne.titre} aria-label={colonne.titre}>
            {/* En typographie de texte, pas en monospace majuscule espacé : c'est
                un intitulé de colonne de pied de page, la structure la plus
                ordinaire qui soit, et rien n'y demandait d'insister. */}
            <p className="mb-3 font-body text-sm font-semibold text-white/50">{colonne.titre}</p>
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
        <p className="font-body text-xs text-white/55">
          © {new Date().getFullYear()} GTCS · Kolek. Aucun flux d’épargne ne transite par cette
          page.
        </p>
        {/* Il y avait ici un point vert et la mention « SYSTÈME OPÉRATIONNEL ».
            Retiré le 2026-09-04.

            Le point avait déjà cessé de battre le 2026-09-02, au motif qu'il ne
            mesurait rien. C'était traiter le symptôme : ce n'est pas le battement
            qui mentait, c'est le vert. Un voyant d'état emprunte l'apparence d'une
            sonde, et la CSP de cette page interdit tout appel sortant — aucune
            sonde ne peut donc exister ici pour le confirmer ou le démentir.

            Ce qui restait de vrai — « le site est servi, donc l'infrastructure qui
            le sert répond » — le visiteur le sait déjà : il lit la page. */}
      </div>
    </footer>
  );
}
