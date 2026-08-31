import { MISES_PAR_CYCLE } from '@kolek/core';

interface Props {
  nomClient: string;
  misePar: string;
  jourCourant: number;
  totalJours?: number;
  solde: string;
  cycle: string;
}

/**
 * La carte de collecte est l'objet central du métier : le carnet papier que
 * Kolek remplace. Le nombre de cases n'est donc pas une valeur de maquette mais
 * la règle du produit, tenue par le moteur de calcul — d'où l'import plutôt
 * qu'un 31 écrit ici.
 *
 * ## Pourquoi elle se mesure elle-même, le 2026-08-31
 *
 * Depuis que le carrousel sait réduire ses cartes pour en montrer deux ou
 * quatre ensemble, la même carte est rendue tantôt à 160 px, tantôt à toute la
 * largeur de l'écran. Les valeurs d'origine — 31 cases sur 16 colonnes, un
 * solde en `text-2xl` — sont justes à pleine largeur et illisibles à 160.
 *
 * La taille aurait pu arriver par propriété. Elle arrive par **requête de
 * conteneur** : une propriété obligerait chaque appelant à savoir de quelle
 * taille il a besoin, alors que la seule chose qui compte est la largeur que la
 * carte reçoit réellement. Ici elle la lit.
 *
 * ### Le sens de la règle n'est pas indifférent
 *
 * Les valeurs de base sont celles de la pleine largeur, et c'est le format
 * réduit qui s'écrit en `@max-[240px]:`. L'inverse était plus court à écrire et
 * aurait été un piège : les requêtes de conteneur demandent Chrome 105, et le
 * collecteur travaille sur des téléphones d'entrée de gamme dont le WebView est
 * parfois plus vieux. Une règle ignorée doit laisser l'écran tel qu'il était —
 * ici l'accueil, l'encaissement et le carrousel agrandi gardent exactement leur
 * rendu d'avant, et seul le mode réduit, qui est neuf, s'y affiche serré.
 */
export function CarteCollecte({
  nomClient,
  misePar,
  jourCourant,
  totalJours = MISES_PAR_CYCLE,
  solde,
  cycle,
}: Props) {
  const cases = Array.from({ length: totalJours }, (_, i) => i + 1);
  const pourcentage = Math.round((jourCourant / totalJours) * 100);

  return (
    <div className="@container rounded-xl overflow-hidden relative shadow-lg min-h-50 @max-[240px]:min-h-40 bg-[image:var(--degrade-carte)] border border-white/30 backdrop-blur-xs">
      {/* Cercles et reflets décoratifs */}
      <div className="pointer-events-none absolute top-0 right-0 w-48 h-48 rounded-pill opacity-25 translate-x-[20%] -translate-y-[30%] bg-[radial-gradient(circle,#ffffff_0%,transparent_70%)]" />
      <div className="pointer-events-none absolute bottom-0 left-0 w-36 h-36 rounded-pill opacity-20 -translate-x-[20%] translate-y-[30%] bg-[radial-gradient(circle,var(--color-primary)_0%,transparent_70%)]" />

      <div className="relative p-5 @max-[240px]:p-3">
        {/* En-tête. Côte à côte tant qu'il y a la place ; l'un sous l'autre
            quand la carte est réduite, où deux colonnes ne laisseraient au nom
            du client que quelques caractères. */}
        <div className="flex items-start justify-between mb-4 @max-[240px]:flex-col @max-[240px]:gap-2 @max-[240px]:mb-3">
          <div>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-pill bg-white/25 backdrop-blur-md border border-white/40 text-[10px] font-body font-bold uppercase tracking-widest text-ink/80 mb-1.5 shadow-xs @max-[240px]:px-2 @max-[240px]:text-[9px] @max-[240px]:mb-1">
              Cycle {cycle}
            </span>
            <p className="font-headings font-bold text-xl text-ink leading-snug @max-[240px]:text-base">
              {nomClient}
            </p>
          </div>
          <div className="bg-white/30 backdrop-blur-md rounded-xl border border-white/40 px-3 py-1.5 text-right shadow-xs @max-[240px]:px-2 @max-[240px]:py-1 @max-[240px]:text-left">
            <p className="text-[11px] font-body font-medium text-ink/75 @max-[240px]:text-[10px]">
              Mise / jour
            </p>
            <p className="font-body font-bold text-base text-ink tabular-nums @max-[240px]:text-sm">
              {misePar} <span className="text-xs font-normal">FCFA</span>
            </p>
          </div>
        </div>

        {/* Les 31 cases du cycle. Sur huit colonnes quand la carte est réduite :
            seize cases sur 136 px de large donneraient des traits de 6 px, où
            l'on ne distingue plus la case payée de la case à payer. */}
        <div className="grid grid-cols-16 gap-1 mb-4 p-1.5 rounded-lg bg-black/5 backdrop-blur-xs border border-white/10 @max-[240px]:grid-cols-8 @max-[240px]:gap-0.5 @max-[240px]:mb-3 @max-[240px]:p-1">
          {cases.map((numero) => (
            <div
              key={numero}
              className={`h-5 rounded-xs flex items-center justify-center transition-all @max-[240px]:h-3 ${
                numero < jourCourant
                  ? 'bg-ink/75 text-white'
                  : numero === jourCourant
                    ? 'bg-sidebar shadow-xs ring-1 ring-white/60'
                    : 'bg-white/45'
              }`}
            >
              {numero === jourCourant && (
                <div className="w-1.5 h-1.5 rounded-pill bg-chart-mint animate-pulse" />
              )}
            </div>
          ))}
        </div>

        {/* Pied */}
        <div className="flex items-end justify-between pt-1 @max-[240px]:flex-col @max-[240px]:items-start @max-[240px]:gap-1.5">
          <div>
            <p className="text-xs font-body font-medium text-ink/70 mb-0.5 @max-[240px]:text-[10px]">
              Solde restituable
            </p>
            <p className="font-headings font-bold text-2xl text-ink tabular-nums leading-none @max-[240px]:text-lg">
              {solde}{' '}
              <span className="text-sm font-body font-medium text-ink/80 @max-[240px]:text-xs">
                FCFA
              </span>
            </p>
          </div>
          <div className="text-right @max-[240px]:text-left">
            <span className="inline-flex items-center px-2 py-0.5 rounded-pill bg-white/20 backdrop-blur-xs text-xs font-body font-semibold text-ink/80 border border-white/20 @max-[240px]:text-[10px]">
              {jourCourant}/{totalJours} j · {pourcentage} %
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
