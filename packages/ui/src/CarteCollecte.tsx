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
    <div className="rounded-xl overflow-hidden relative shadow-lg min-h-50 bg-[image:var(--degrade-carte)] border border-white/30 backdrop-blur-xs">
      {/* Cercles et reflets décoratifs */}
      <div className="pointer-events-none absolute top-0 right-0 w-48 h-48 rounded-pill opacity-25 translate-x-[20%] -translate-y-[30%] bg-[radial-gradient(circle,#ffffff_0%,transparent_70%)]" />
      <div className="pointer-events-none absolute bottom-0 left-0 w-36 h-36 rounded-pill opacity-20 -translate-x-[20%] translate-y-[30%] bg-[radial-gradient(circle,var(--color-primary)_0%,transparent_70%)]" />

      <div className="relative p-5">
        {/* En-tête */}
        <div className="flex items-start justify-between mb-4">
          <div>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-pill bg-white/25 backdrop-blur-md border border-white/40 text-[10px] font-body font-bold uppercase tracking-widest text-ink/80 mb-1.5 shadow-xs">
              Cycle {cycle}
            </span>
            <p className="font-headings font-bold text-xl text-ink leading-snug">{nomClient}</p>
          </div>
          <div className="bg-white/30 backdrop-blur-md rounded-xl border border-white/40 px-3 py-1.5 text-right shadow-xs">
            <p className="text-[11px] font-body font-medium text-ink/75">Mise / jour</p>
            <p className="font-body font-bold text-base text-ink tabular-nums">
              {misePar} <span className="text-xs font-normal">FCFA</span>
            </p>
          </div>
        </div>

        {/* Les 31 cases du cycle */}
        <div className="grid grid-cols-16 gap-1 mb-4 p-1.5 rounded-lg bg-black/5 backdrop-blur-xs border border-white/10">
          {cases.map((numero) => (
            <div
              key={numero}
              className={`h-5 rounded-xs flex items-center justify-center transition-all ${
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
        <div className="flex items-end justify-between pt-1">
          <div>
            <p className="text-xs font-body font-medium text-ink/70 mb-0.5">Solde restituable</p>
            <p className="font-headings font-bold text-2xl text-ink tabular-nums leading-none">
              {solde} <span className="text-sm font-body font-medium text-ink/80">FCFA</span>
            </p>
          </div>
          <div className="text-right">
            <span className="inline-flex items-center px-2 py-0.5 rounded-pill bg-white/20 backdrop-blur-xs text-xs font-body font-semibold text-ink/80 border border-white/20">
              {jourCourant}/{totalJours} j · {pourcentage} %
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
