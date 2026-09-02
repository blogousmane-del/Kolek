import { MISES_PAR_CYCLE, formatMontant, soldeRestituable } from "@kolek/core";
import { CarteCollecte } from "@kolek/ui";

/**
 * L'écran du collecteur, dans un téléphone, au premier regard.
 *
 * ## Pourquoi il existe
 *
 * L'audit du 2026-09-02 a compté zéro image sur tout le site : ni marché, ni
 * téléphone, ni visage. Une page qui vend un outil de terrain sans jamais le
 * montrer demande au visiteur de croire sur parole.
 *
 * ## Pourquoi ce n'est pas une photographie
 *
 * Une capture d'écran se périme au premier changement d'interface et personne
 * ne s'en aperçoit — la page continue de montrer un produit qui n'existe plus.
 * Ici l'écran est rendu par `CarteCollecte`, **le composant que le collecteur
 * voit vraiment** : le jour où la carte de collecte change, cette vitrine
 * change avec elle, sans que quiconque y pense.
 *
 * ## Pourquoi les chiffres sont calculés
 *
 * `soldeRestituable` est la fonction du moteur, pas un nombre recopié. Une
 * carte de 2 000 FCFA à sa douzième mise rend 22 000 FCFA parce que la
 * première mise est la commission du collecteur — c'est la règle du produit, et
 * la page ne sait pas l'écrire autrement. Principe 7 du système de design : ne
 * jamais afficher un chiffre qu'on ne sait pas.
 *
 * Le nom est inventé ; aucune donnée réelle ne sort vers ce site, sa CSP
 * l'interdit.
 */

const DEMO = { nom: "Aya Koffi", mise: 2000, misesEncaissees: 12 } as const;

export function Telephone({ className }: { className?: string }) {
  const solde = soldeRestituable(DEMO.misesEncaissees, DEMO.mise);

  return (
    <div
      className={className}
      role="img"
      aria-label={`L’écran d’encaissement de Kolek : la carte de ${DEMO.nom}, ${DEMO.misesEncaissees} mises sur ${MISES_PAR_CYCLE}, ${formatMontant(solde)} FCFA de solde restituable, et le bouton qui encaisse la mise du jour.`}
    >
      {/* Le châssis. Une lueur or au lieu d'une ombre noire : sur un fond vert
          coffre, une ombre neutre creuse un trou, un halo chaud pose l'objet. */}
      <div className="relative mx-auto w-[320px] max-w-full rounded-[2.75rem] border border-white/15 bg-dark-canvas p-2.5 shadow-[0_30px_80px_-20px_rgba(210,178,76,0.25)]">
        <div
          className="overflow-hidden rounded-[2.25rem] bg-canvas"
          aria-hidden
        >
          {/* La barre haute du collecteur, à l'identique : fond `sidebar`,
              titre en Sora, retour à gauche. */}
          <div className="flex items-center gap-3 bg-sidebar px-4 pb-4 pt-5">
            <span className="flex h-8 w-8 items-center justify-center rounded-pill bg-white/10 text-white/70">
              <svg viewBox="0 0 24 24" className="h-4 w-4">
                <path
                  d="M15 6l-6 6 6 6"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
            <p className="font-headings text-lg font-bold tracking-tight text-white">
              Encaisser une mise
            </p>
          </div>

          <div className="px-4 pb-5 pt-4">
            <CarteCollecte
              nomClient={DEMO.nom}
              misePar={formatMontant(DEMO.mise)}
              jourCourant={DEMO.misesEncaissees}
              solde={formatMontant(solde)}
              cycle="1"
            />

            {/* Pas de champ de saisie : le montant est imposé par la carte, et
                la carte l'affiche déjà. Le répéter allongeait l'appareil au point
                de pousser le titre hors du premier écran sur un portable. */}
            <div className="mt-4 w-full rounded-pill bg-primary py-3.5 text-center font-body text-base font-semibold text-primary-foreground shadow-action">
              Encaisser
            </div>
            <p className="mt-3 text-center font-body text-xs text-muted-foreground">
              Reçu n° 7F3A · case 13 cochée
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
