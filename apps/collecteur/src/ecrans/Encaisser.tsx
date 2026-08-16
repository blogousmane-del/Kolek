import { formatMontant, MISE_MAX, MISE_MIN } from '@kolek/core';
import {
  Avatar,
  BadgeStatut,
  BandeauHorsLigne,
  CarteCollecte,
  Icone,
  useEnLigne,
  type CleNavCollecteur,
} from '@kolek/ui';
import { useState } from 'react';

/** Paliers usuels du marché, tous compris dans [MISE_MIN, MISE_MAX]. */
const PALIERS = [500, 1000, 2000, 5000, 10000] as const;

/**
 * Écran de démonstration : la sélection fonctionne, l'enregistrement non. Le
 * bouton reste donc désactivé et le dit. Un bouton « Confirmer » qui n'écrit
 * rien en base est le pire mensonge que puisse faire cette application — le
 * collecteur repart en pensant la mise encaissée.
 */
export function Encaisser({ onNaviguer }: { onNaviguer: (cle: CleNavCollecteur) => void }) {
  const [montant, setMontant] = useState<number>(1000);
  const enLigne = useEnLigne();

  const valide = montant >= MISE_MIN && montant <= MISE_MAX;

  return (
    <div className="flex-1 flex flex-col">
      {/* En-tête */}
      <div className="bg-sidebar px-5 pt-12 pb-5">
        <div className="flex items-center justify-between mb-1">
          <button
            type="button"
            onClick={() => onNaviguer('clients')}
            aria-label="Revenir aux clients"
            className="w-9 h-9 rounded-pill bg-white/10 flex items-center justify-center cursor-pointer"
          >
            <Icone nom="arrow-left" className="text-white" />
          </button>
          <p className="font-headings font-bold text-white text-lg">Encaisser une mise</p>
          <button
            type="button"
            aria-label="Autres actions"
            className="w-9 h-9 rounded-pill bg-white/10 flex items-center justify-center cursor-pointer"
          >
            <Icone nom="more-horizontal" className="text-white" />
          </button>
        </div>
      </div>

      {!enLigne && <BandeauHorsLigne className="mx-4 mt-3" />}

      {/* Client */}
      <div className="mx-4 mt-3 bg-surface rounded-xl border border-hairline p-4 flex items-center gap-3 shadow-md">
        <Avatar nom="Mariam Koné" className="w-12 h-12" />
        <div className="flex-1 min-w-0">
          <p className="font-headings font-bold text-lg text-ink truncate">Mariam Koné</p>
          <div className="flex items-center gap-2 mt-0.5">
            <BadgeStatut statut="À jour" className="px-2 py-0.5" />
            <span className="text-sm font-body text-muted-foreground">Cycle 3 · Jour 18/31</span>
          </div>
        </div>
        <Icone nom="chevron-right" className="text-muted-foreground" />
      </div>

      <div className="mx-4 mt-3">
        <CarteCollecte
          nomClient="Mariam Koné"
          misePar="1 000"
          jourCourant={18}
          solde="18 000"
          cycle="3"
        />
      </div>

      {/* Paliers */}
      <div className="mx-4 mt-5">
        <p className="text-sm font-body font-semibold text-ink mb-2">Montant de la mise</p>
        <div className="flex gap-2 flex-wrap">
          {PALIERS.map((palier) => (
            <button
              key={palier}
              type="button"
              onClick={() => setMontant(palier)}
              className={`px-4 py-2 rounded-pill text-base font-body font-semibold border tabular-nums cursor-pointer ${
                palier === montant
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-surface text-ink border-hairline'
              }`}
            >
              {formatMontant(palier)}
            </button>
          ))}
        </div>
      </div>

      {/* Saisie libre */}
      <div className="mx-4 mt-4">
        <label
          htmlFor="montant-libre"
          className="block text-sm font-body font-semibold text-ink mb-2"
        >
          Ou saisir un montant
        </label>
        <div
          className={`flex items-center gap-3 bg-surface border-2 rounded-md px-4 py-3 ${
            valide ? 'border-primary' : 'border-negative'
          }`}
        >
          {/* `type="text"` et non `number` : un champ numérique natif refuse
              l'espace des milliers, et le montant s'afficherait « 10000 » là où
              tout le reste du produit écrit « 10 000 ». `inputMode` garde le
              pavé numérique sur le téléphone. */}
          <input
            id="montant-libre"
            type="text"
            inputMode="numeric"
            value={formatMontant(montant)}
            onChange={(e) => setMontant(Number(e.target.value.replace(/\D/g, '')) || 0)}
            className="flex-1 min-w-0 bg-transparent font-headings font-bold text-2xl text-ink tabular-nums outline-none"
          />
          <span className="text-base font-body font-medium text-muted-foreground">FCFA</span>
        </div>
        {!valide && (
          <p className="text-sm font-body text-negative mt-1.5">
            La mise doit être comprise entre {formatMontant(MISE_MIN)} et {formatMontant(MISE_MAX)}{' '}
            FCFA.
          </p>
        )}
      </div>

      {/* Note */}
      <div className="mx-4 mt-3">
        <label htmlFor="note" className="block text-sm font-body font-semibold text-ink mb-2">
          Note (optionnel)
        </label>
        <input
          id="note"
          type="text"
          placeholder="Ajouter une note…"
          className="w-full bg-surface border border-hairline rounded-md px-4 py-3 text-base font-body text-ink outline-none focus:border-primary placeholder:text-muted-foreground"
        />
      </div>

      <div className="flex-1 min-h-4" />

      {/* Confirmation */}
      <div className="mx-4 mb-4">
        <button
          type="button"
          disabled
          className="w-full rounded-pill bg-primary text-primary-foreground font-body font-bold text-lg py-4 flex items-center justify-center gap-2 opacity-50 cursor-default"
        >
          <Icone nom="check-circle" taille={20} />
          Confirmer la mise — {formatMontant(montant)} FCFA
        </button>
        <p className="text-xs text-center text-muted-foreground font-body mt-2">
          L’enregistrement d’une mise arrive au jalon J2a.
        </p>
      </div>
    </div>
  );
}
