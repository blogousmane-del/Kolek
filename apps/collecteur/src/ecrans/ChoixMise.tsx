import {
  MISE_MAX_RESTITUABLE,
  MISE_MIN,
  formatMontant,
  miseInhabituelle,
  validerMise,
} from '@kolek/core';
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
 * ## Pourquoi le champ libre reste en second
 *
 * Neuf cartes sur dix se règlent d'un seul appui sur un palier. Mettre le
 * clavier numérique en premier ferait payer à tout le monde le cas rare —
 * saisir « 1000 » au doigt, debout, est plus long et plus faux qu'appuyer sur
 * un bouton.
 *
 * ## Pourquoi ce composant peut refuser de remonter un montant
 *
 * Une mise est figée à l'ouverture de la carte et ne se corrige pas : les 31
 * versements qui suivent en dépendent. L'ancien plafond de 10 000 servait
 * autant de règle commerciale que de garde-fou contre le zéro de trop. La règle
 * tombe, le garde-fou reste — sous la forme d'une confirmation.
 *
 * D'où l'invariant : **tant que le champ libre est ouvert, le parent détient
 * exactement ce que le champ montre.** `null` si le champ est vide, invalide,
 * ou inhabituel-non-confirmé. La rétention naïve — garder le dernier montant
 * valide — ouvrirait la carte au montant précédent, en silence, pendant que le
 * collecteur regarde le sien à l'écran. Pour une valeur qu'on ne peut plus
 * corriger, c'est pire qu'un refus.
 *
 * C'est aussi pourquoi `onChoisir` prend `number | null` : le type force les
 * trois écrans appelants à garder leur bouton, là où un commentaire aurait été
 * oublié.
 */

/** Paliers usuels du marché, tous à `MISE_INHABITUELLE` ou en dessous. */
export const MISES_USUELLES = [500, 1000, 2000, 5000, 10000] as const;

export function ChoixMise({
  mise,
  onChoisir,
  identifiant,
  estCollaborateur = false,
}: {
  mise: number | null;
  onChoisir: (montant: number | null) => void;
  /** Préfixe des `id` : deux `ChoixMise` peuvent coexister dans un même document. */
  identifiant: string;
  /**
   * La commission de la première mise revient au titulaire, pas à l'encaisseur.
   *
   * Par propriété et non par `useEstCollaborateur()` : ce composant est un
   * morceau de formulaire rendu dans trois écrans, et une lecture ici en ferait
   * trois — dont deux dans des formulaires déjà ouverts, où une phrase qui
   * change en cours de saisie se lit comme un bug.
   *
   * Optionnelle et fausse par défaut : les douze appels de `ChoixMise.test.tsx`
   * restent valides sans être touchés.
   */
  estCollaborateur?: boolean;
}) {
  const surUnPalier = mise !== null && (MISES_USUELLES as readonly number[]).includes(mise);
  const [libre, setLibre] = useState(!surUnPalier);
  // La saisie est gardée en texte : un `number` transformerait « 7 » en une mise
  // de 7 FCFA le temps de taper « 750 », et ferait clignoter le message d'erreur
  // à chaque caractère.
  const [saisie, setSaisie] = useState(surUnPalier || mise === null ? '' : String(mise));
  // Un montant inhabituel reçu en propriété a déjà été confirmé — à l'ouverture
  // de la carte précédente, dont il est repris. Naître décoché violerait
  // l'invariant dès le montage : l'écran présenterait comme non confirmé un
  // montant que le parent détient bel et bien.
  const [confirme, setConfirme] = useState(mise !== null && miseInhabituelle(mise));

  const valeurSaisie = saisie.trim() === '' ? Number.NaN : Number(saisie);
  const saisieValide = validerMise(valeurSaisie);

  /** Ce que l'écran porte à cet instant, confirmé ou non. */
  const montantAffiche = libre && saisieValide ? valeurSaisie : mise;

  /** Une saisie valide, mais assez grosse pour mériter d'être relue. */
  const inhabituelSaisi = libre && saisieValide && miseInhabituelle(valeurSaisie);

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
              setConfirme(false);
              // Aucun palier n'est au-dessus du seuil : un palier ne demande
              // jamais rien, y compris 10 000, qui lui est égal.
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
          onClick={() => {
            // Le nettoyage ne vaut que si l'on **quitte un palier** : sans lui,
            // « Autre » puis « Ouvrir la carte » enregistrerait le palier que
            // le collecteur venait de quitter. Quand le champ est déjà ouvert,
            // la pilule est simplement celle qui est allumée, et l'appui dessus
            // veut dire « je viens modifier ça » — effacer y détruirait un
            // montant que le parent détient déjà, `misePreremplie` compris.
            if (!libre) {
              setSaisie('');
              setConfirme(false);
              onChoisir(null);
            }
            setLibre(true);
          }}
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
                // Changer le montant retire la reconnaissance : la case portait
                // sur l'ancien, et le laisser coché validerait un montant que
                // personne n'a relu.
                setConfirme(false);
                const valeur = Number(texte);
                onChoisir(validerMise(valeur) && !miseInhabituelle(valeur) ? valeur : null);
              }}
              className="w-36 bg-surface border border-hairline rounded-md px-3 py-2.5 text-base font-body text-ink tabular-nums outline-none focus:border-primary"
            />
            <span className="text-base font-body text-muted-foreground">FCFA / jour</span>
          </div>

          {saisie.trim() !== '' && !saisieValide && (
            <p role="alert" className="text-sm font-body text-negative mt-1">
              {valeurSaisie > MISE_MAX_RESTITUABLE
                ? 'Montant trop grand.'
                : `Au moins ${formatMontant(MISE_MIN)} FCFA, sans centimes.`}
            </p>
          )}
        </div>
      )}

      {/* Le cycle complet, calculé pour le client. C'est la question qu'il pose
          juste après le montant : « ça fait combien au bout ? » — et c'est le
          chiffre qui motive la confirmation ci-dessous, donc il se calcule sur
          ce que l'écran porte, pas sur ce que le parent détient. */}
      {montantAffiche !== null && validerMise(montantAffiche) && (
        <p className="text-xs font-body text-muted-foreground mt-2">
          31 jours · le client verse {formatMontant(montantAffiche * 31)} FCFA, tu lui rends{' '}
          {formatMontant(montantAffiche * 30)} FCFA.{' '}
          {estCollaborateur
            ? 'La première mise revient à ton titulaire.'
            : 'La première mise est ta commission.'}
        </p>
      )}

      {inhabituelSaisi && (
        <label className="flex items-start gap-3 rounded-md p-3 mt-2 border border-hairline cursor-pointer">
          <input
            type="checkbox"
            checked={confirme}
            onChange={(e) => {
              setConfirme(e.target.checked);
              onChoisir(e.target.checked ? valeurSaisie : null);
            }}
            className="mt-0.5 w-4 h-4 shrink-0"
          />
          <span className="min-w-0">
            <span className="block text-sm font-body font-semibold text-ink">
              Je confirme {formatMontant(valeurSaisie)} FCFA par jour
            </span>
            <span className="block text-xs font-body text-muted-foreground">
              Montant inhabituel. Une mise est figée à l’ouverture de la carte et ne se corrige
              pas.
            </span>
          </span>
        </label>
      )}
    </div>
  );
}
