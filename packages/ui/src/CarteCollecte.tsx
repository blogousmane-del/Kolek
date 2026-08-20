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
    <div className="rounded-xl overflow-hidden relative shadow-md min-h-50 bg-[image:var(--degrade-carte)]">
      {/* Cercles décoratifs */}
      <div className="absolute top-0 right-0 w-40 h-40 rounded-pill opacity-20 translate-x-[20%] -translate-y-[30%] bg-[radial-gradient(circle,#ffffff_0%,transparent_70%)]" />
      <div className="absolute bottom-0 left-0 w-32 h-32 rounded-pill opacity-15 -translate-x-[20%] translate-y-[30%] bg-[radial-gradient(circle,var(--color-primary)_0%,transparent_70%)]" />

      <div className="relative p-5">
        {/* En-tête */}
        <div className="flex items-start justify-between mb-4">
          <div>
            <p className="text-xs font-body font-semibold uppercase tracking-widest text-ink/60 mb-0.5">
              Cycle {cycle}
            </p>
            <p className="font-headings font-bold text-xl text-ink">{nomClient}</p>
          </div>
          <div className="bg-ink/10 rounded-md px-3 py-1.5 text-right">
            <p className="text-xs font-body text-ink/70">Mise / jour</p>
            <p className="font-body font-bold text-base text-ink tabular-nums">
              {misePar} <span className="text-xs">FCFA</span>
            </p>
          </div>
        </div>

        {/* Les 31 cases du cycle */}
        <div className="grid grid-cols-16 gap-1 mb-4">
          {cases.map((numero) => (
            <div
              key={numero}
              className={`h-5 rounded-sm flex items-center justify-center ${
                numero < jourCourant
                  ? 'bg-ink/60'
                  : numero === jourCourant
                    ? 'bg-sidebar'
                    : 'bg-white/40'
              }`}
            >
              {numero === jourCourant && <div className="w-1.5 h-1.5 rounded-pill bg-chart-mint" />}
            </div>
          ))}
        </div>

        {/* Pied */}
        <div className="flex items-end justify-between">
          <div>
            <p className="text-xs font-body text-ink/60 mb-0.5">Solde restituable</p>
            <p className="font-headings font-bold text-2xl text-ink tabular-nums">
              {solde} <span className="text-sm font-body font-medium">FCFA</span>
            </p>
          </div>
          <div className="text-right">
            <span className="text-xs font-body font-medium text-ink/70">
              {jourCourant}/{totalJours} jours · {pourcentage} %
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
