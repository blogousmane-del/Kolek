import { formatMontant } from '@kolek/core';
import type { ReactNode } from 'react';

/**
 * Un décompte de caisse : des lignes, et le total sous un double filet.
 *
 * Il est né pour le retrait, où le collecteur rend de l'argent et ne peut pas
 * se tromper : « 31 mises × 1 000, moins la commission, à rendre 30 000 ».
 * C'est la forme qu'a tout ticket de caisse, et le collecteur peut le lire au
 * client avant de payer.
 *
 * Les points de conduite vivent dans le `dt`, et non entre le `dt` et le
 * `dd` : un `dl` n'admet entre eux ni `span` ni `div`. Ils sont décoratifs,
 * donc `aria-hidden`.
 */
export interface LigneDecompte {
  libelle: ReactNode;
  montant: number;
}

/** L'espace fine insécable (U+202F), écrite par son code : une séquence
    d'échappement tapée devient en route un caractère invisible. */
const FINE = String.fromCharCode(0x202f);

function signe(montant: number): string {
  return montant < 0 ? `−${FINE}${formatMontant(-montant)}` : formatMontant(montant);
}

export function Decompte({
  lignes,
  total,
}: {
  lignes: LigneDecompte[];
  total: { libelle: string; montant: number };
}) {
  return (
    <dl className="font-body">
      {lignes.map((ligne, rang) => (
        <div key={rang} className="flex items-baseline gap-2 py-1.5">
          <dt className="flex min-w-0 flex-1 items-baseline gap-2 text-sm text-muted-foreground">
            <span>{ligne.libelle}</span>
            <span
              aria-hidden="true"
              className="min-w-4 flex-1 -translate-y-1 border-b-2 border-dotted border-trait/50"
            />
          </dt>
          <dd className="font-mono text-base font-medium text-ink tabular-nums">
            {signe(ligne.montant)}
          </dd>
        </div>
      ))}
      <div className="mt-2 flex items-baseline justify-between gap-2 border-t-4 border-double border-ink pt-2.5">
        <dt className="text-base font-semibold text-ink">{total.libelle}</dt>
        <dd className="font-mono text-2xl font-medium text-ink tabular-nums">
          {signe(total.montant)}{' '}
          <span className="font-body text-sm font-medium text-muted-foreground">FCFA</span>
        </dd>
      </div>
    </dl>
  );
}
