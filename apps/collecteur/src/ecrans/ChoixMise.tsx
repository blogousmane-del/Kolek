import { MISE_MAX_STOCKABLE, MISE_MIN, formatMontant, validerMise } from '@kolek/core';
import { useState } from 'react';

/**
 * Le choix de la mise journalière.
 *
 * ## Pourquoi les paliers ne suffisent pas
 *
 * Les cinq montants proposés — 500, 1 000, 2 000, 5 000, 10 000 — sont ceux
 * qu'on entend le plus au marché, et ils couvrent la majorité des cartes. Mais
 * la base accepte **tout entier à partir de 500** : la contrainte de
 * `cartes.mise` est un plancher, pas une liste. Une cliente qui veut mettre
 * 750 FCFA par jour a le droit, et une autre qui met 50 000 aussi.
 *
 * Le collecteur négocie ce montant devant l'étal. L'interface doit pouvoir
 * écrire ce qui a été convenu, pas le plus proche des cinq.
 *
 * ## Pourquoi le champ libre reste en second
 *
 * Neuf cartes sur dix se règlent d'un seul appui sur un palier. Mettre le
 * clavier numérique en premier ferait payer à tout le monde le cas rare —
 * saisir « 1000 » au doigt, debout, est plus long et plus faux qu'appuyer sur
 * un bouton.
 */

/** Paliers usuels du marché, tous compris dans [MISE_MIN, MISE_INHABITUELLE]. */
export const MISES_USUELLES = [500, 1000, 2000, 5000, 10000] as const;

export function ChoixMise({
  mise,
  onChoisir,
  identifiant,
}: {
  mise: number;
  onChoisir: (montant: number) => void;
  /** Préfixe des `id` : deux `ChoixMise` peuvent coexister dans un même document. */
  identifiant: string;
}) {
  const surUnPalier = (MISES_USUELLES as readonly number[]).includes(mise);
  const [libre, setLibre] = useState(!surUnPalier);
  // La saisie est gardée en texte : un `number` transformerait « 7 » en une mise
  // de 7 FCFA le temps de taper « 750 », et ferait clignoter le message d'erreur
  // à chaque caractère.
  const [saisie, setSaisie] = useState(surUnPalier ? '' : String(mise));

  const valeurSaisie = saisie.trim() === '' ? Number.NaN : Number(saisie);
  const saisieValide = validerMise(valeurSaisie);

  return (
    <div>
      <p className="text-sm font-body font-semibold text-ink mb-2">Mise journalière</p>

      <div className="flex gap-2 flex-wrap mb-2">
        {MISES_USUELLES.map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => {
              setLibre(false);
              setSaisie('');
              onChoisir(m);
            }}
            className={`anim-pression px-3 py-2 rounded-md text-base font-body font-semibold border tabular-nums cursor-pointer ${
              !libre && m === mise
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-surface text-ink border-hairline'
            }`}
          >
            {formatMontant(m)}
          </button>
        ))}

        <button
          type="button"
          onClick={() => setLibre(true)}
          className={`anim-pression px-3 py-2 rounded-md text-base font-body font-semibold border cursor-pointer ${
            libre
              ? 'bg-primary text-primary-foreground border-primary'
              : 'bg-surface text-ink border-hairline'
          }`}
        >
          Autre
        </button>
      </div>

      {libre && (
        <div className="mt-2">
          <label
            htmlFor={`${identifiant}-montant`}
            className="block text-sm font-body text-muted-foreground mb-1"
          >
            Montant convenu avec le client
          </label>
          <div className="flex items-center gap-2">
            <input
              id={`${identifiant}-montant`}
              type="number"
              inputMode="numeric"
              min={MISE_MIN}
              step={50}
              value={saisie}
              autoFocus
              onChange={(e) => {
                const texte = e.target.value;
                setSaisie(texte);
                const valeur = Number(texte);
                // La mise ne remonte que si elle est valide. Sinon on laisse la
                // dernière valeur bonne en place : le bouton d'enregistrement
                // reste désactivé par le message ci-dessous, et rien
                // d'invalide ne part.
                if (validerMise(valeur)) onChoisir(valeur);
              }}
              className="w-36 bg-surface border border-hairline rounded-md px-3 py-2.5 text-base font-body text-ink tabular-nums outline-none focus:border-primary"
            />
            <span className="text-base font-body text-muted-foreground">FCFA / jour</span>
          </div>

          {saisie.trim() !== '' && !saisieValide && (
            <p role="alert" className="text-sm font-body text-negative mt-1">
              {valeurSaisie > MISE_MAX_STOCKABLE
                ? "Montant trop grand."
                : `Au moins ${formatMontant(MISE_MIN)} FCFA, sans centimes.`}
            </p>
          )}
        </div>
      )}

      {/* Le cycle complet, calculé pour le client. C'est la question qu'il pose
          juste après le montant : « ça fait combien au bout ? » */}
      {validerMise(mise) && (
        <p className="text-xs font-body text-muted-foreground mt-2">
          31 jours · le client verse {formatMontant(mise * 31)} FCFA, tu lui rends{' '}
          {formatMontant(mise * 30)} FCFA. La première mise est ta commission.
        </p>
      )}
    </div>
  );
}
