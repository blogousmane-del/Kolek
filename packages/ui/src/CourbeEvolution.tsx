import { useState } from 'react';

/**
 * Une série datée, en ligne.
 *
 * Sans bibliothèque : une polyligne et des points tiennent en quelques
 * dizaines de lignes, et une bibliothèque de graphiques pèserait plus que
 * l'écran qui l'afficherait.
 *
 * ## Ce qu'elle refuse de faire
 *
 * Tracer sous deux points. Étirer une série plate sur toute la hauteur — une
 * variation nulle deviendrait un mouvement. Porter seule l'information : le
 * tableau des valeurs est dans le document, pour qui ne voit pas la courbe.
 */

export interface PointCourbe {
  /** `AAAA-MM-JJ`, un jour d'Abidjan. */
  jour: string;
  valeur: number;
}

interface Props {
  /** Ce que la courbe mesure : légende du tableau et nom du graphique. */
  libelle: string;
  /** Du plus ancien au plus récent. */
  points: PointCourbe[];
  formater: (valeur: number) => string;
}

const LARGEUR = 600;
const HAUTEUR = 180;
const MARGE = 12;

/** Lu en UTC, qui est l'heure d'Abidjan : un jour ne glisse pas d'un fuseau à l'autre. */
function jourCourt(jour: string): string {
  return new Date(`${jour}T00:00:00Z`).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}

export function CourbeEvolution({ libelle, points, formater }: Props) {
  const [actif, setActif] = useState<number | null>(null);

  if (points.length < 2) {
    const seul = points[0];
    return (
      <p className="font-body text-sm text-muted-foreground">
        La courbe se dessine à partir du deuxième relevé.
        {seul && ` Premier relevé : ${formater(seul.valeur)}, le ${jourCourt(seul.jour)}.`}
      </p>
    );
  }

  const valeurs = points.map((p) => p.valeur);
  const min = Math.min(...valeurs);
  const max = Math.max(...valeurs);
  const etendue = max - min;

  const x = (i: number) => MARGE + (i * (LARGEUR - 2 * MARGE)) / (points.length - 1);
  const y = (v: number) =>
    etendue === 0 ? HAUTEUR / 2 : MARGE + ((max - v) * (HAUTEUR - 2 * MARGE)) / etendue;

  const trace = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.valeur).toFixed(1)}`)
    .join(' ');
  const pointActif = actif === null ? null : points[actif];
  // Deux points au moins, garantis par le retour ci-dessus.
  const premier = points[0]!;
  const dernier = points[points.length - 1]!;

  return (
    <figure className="m-0">
      <div className="flex items-baseline justify-between gap-2 mb-2 min-h-5">
        <span className="font-body text-xs text-muted-foreground tabular-nums">{formater(max)}</span>
        <p role="status" className="font-body text-sm font-medium text-ink tabular-nums">
          {pointActif ? `${jourCourt(pointActif.jour)} · ${formater(pointActif.valeur)}` : ''}
        </p>
      </div>

      <svg
        viewBox={`0 0 ${LARGEUR} ${HAUTEUR}`}
        className="w-full h-auto"
        role="group"
        aria-label={`${libelle}, du ${jourCourt(premier.jour)} au ${jourCourt(dernier.jour)}`}
      >
        <path
          d={trace}
          fill="none"
          className="stroke-primary"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {points.map((p, i) => (
          <circle
            key={p.jour}
            cx={x(i)}
            cy={y(p.valeur)}
            r={actif === i ? 5 : 3.5}
            className={actif === i ? 'fill-primary' : 'fill-surface stroke-primary'}
            strokeWidth={1.5}
            tabIndex={0}
            role="img"
            aria-label={`${jourCourt(p.jour)} : ${formater(p.valeur)}`}
            onMouseEnter={() => setActif(i)}
            onMouseLeave={() => setActif(null)}
            onFocus={() => setActif(i)}
            onBlur={() => setActif(null)}
          />
        ))}
      </svg>

      <div className="flex justify-between gap-2 font-body text-xs text-muted-foreground mt-1">
        <span>{jourCourt(premier.jour)}</span>
        <span className="tabular-nums">min. {formater(min)}</span>
        <span>{jourCourt(dernier.jour)}</span>
      </div>

      <table className="sr-only">
        <caption>{libelle}</caption>
        <thead>
          <tr>
            <th scope="col">Jour</th>
            <th scope="col">Valeur</th>
          </tr>
        </thead>
        <tbody>
          {points.map((p) => (
            <tr key={p.jour}>
              <td>{jourCourt(p.jour)}</td>
              <td>{formater(p.valeur)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
