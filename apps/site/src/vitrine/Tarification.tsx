import { PALIERS, PALIER_RECOMMANDE, formatMontant } from '@kolek/core';
import { CONTACT_DEMO } from './Navbar';
import { entree, useAnimations } from './animation';

/**
 * La grille tarifaire.
 *
 * Les quatre paliers viennent de `packages/core` — la même source que l'écran
 * Réglages de l'administration et le moteur d'abonnement. Cette page ne peut
 * donc pas afficher un prix que le produit ne facture pas : l'écart entre le
 * site et la réalité a un seul endroit où naître, et il est versionné.
 *
 * Le palier mis en avant est `PALIER_RECOMMANDE`, pas un choix de maquette.
 */
export function Tarification() {
  const ref = useAnimations<HTMLElement>((conteneur) => {
    entree('[data-palier]', {
      stagger: 0.15,
      scrollTrigger: { trigger: conteneur, start: 'top 70%' },
    });
  });

  return (
    <section id="tarifs" ref={ref} className="bg-paper px-6 py-24 sm:px-12 lg:px-20">
      <p className="mb-3 font-mono text-xs tracking-widest text-primary">ADHÉSION</p>
      <h2 className="mb-4 max-w-2xl font-headings text-3xl font-bold text-ink sm:text-4xl">
        Un abonnement de collecteur, pas une commission sur l’épargne
      </h2>
      <p className="mb-12 max-w-xl font-body text-base text-muted-foreground">
        Kolek se paie comme un outil : un prix fixe par mois, en FCFA. Jamais un pourcentage sur
        ce que tes clients te confient.
      </p>

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        {PALIERS.map((palier) => {
          const vedette = palier.cle === PALIER_RECOMMANDE;
          return (
            <article
              key={palier.cle}
              data-palier
              className={`flex flex-col rounded-[2rem] p-6 ${
                vedette
                  ? 'bg-sidebar text-white shadow-lg ring-2 ring-or'
                  : 'border border-hairline bg-surface text-ink shadow-sm'
              }`}
            >
              <div className="mb-4 flex items-center justify-between">
                <h3 className="font-headings text-xl font-bold">{palier.nom}</h3>
                {vedette && (
                  <span className="rounded-pill bg-or px-2.5 py-1 font-mono text-[10px] font-bold tracking-wider text-dark-canvas">
                    RECOMMANDÉ
                  </span>
                )}
              </div>

              <p className={`mb-1 font-headings text-4xl font-bold tabular-nums ${vedette ? 'text-or' : 'text-ink'}`}>
                {palier.prix === 0 ? 'Gratuit' : formatMontant(palier.prix)}
                {palier.prix > 0 && (
                  <span className={`ml-1 font-body text-sm font-medium ${vedette ? 'text-white/50' : 'text-muted-foreground'}`}>
                    FCFA/{palier.periode}
                  </span>
                )}
              </p>
              <p className={`mb-6 font-body text-sm ${vedette ? 'text-white/60' : 'text-muted-foreground'}`}>
                {palier.accroche}
              </p>

              <ul className="mb-8 flex flex-col gap-2.5">
                {palier.fonctions.map((fonction) => (
                  <li key={fonction.libelle} className="flex items-center gap-2.5 font-body text-sm">
                    <span
                      aria-hidden
                      className={`flex h-4 w-4 items-center justify-center rounded-pill text-[10px] ${
                        fonction.incluse
                          ? vedette
                            ? 'bg-or/20 text-or'
                            : 'bg-positive-tint text-positive'
                          : vedette
                            ? 'bg-white/5 text-white/25'
                            : 'bg-muted text-muted-foreground/40'
                      }`}
                    >
                      {fonction.incluse ? '✓' : '—'}
                    </span>
                    <span
                      className={
                        fonction.incluse
                          ? vedette
                            ? 'text-white/85'
                            : 'text-ink'
                          : vedette
                            ? 'text-white/30'
                            : 'text-muted-foreground/50'
                      }
                    >
                      {fonction.libelle}
                    </span>
                  </li>
                ))}
              </ul>

              <a
                href={CONTACT_DEMO}
                className={`magnetique mt-auto overflow-hidden rounded-pill py-3 text-center font-body text-sm font-semibold ${
                  vedette ? 'bg-or text-dark-canvas' : 'border border-primary text-primary'
                }`}
              >
                <span className="relative z-10">
                  {palier.prix === 0 ? 'Commencer l’essai' : 'Demander une démo'}
                </span>
                {vedette && <span aria-hidden className="voile-or" />}
              </a>
            </article>
          );
        })}
      </div>

      <p className="mt-8 font-body text-sm text-muted-foreground">
        Les comptes sont ouverts par l’équipe GTCS après un premier échange — le premier mois est
        un essai, sans engagement.
      </p>
    </section>
  );
}
