import { MISE_MAX, MISE_MIN, formatFCFA, validerMise } from '@kolek/core';
import {
  Avatar,
  BadgeStatut,
  BarreHaute,
  Bouton,
  Carte,
  CarteCollecte,
  Icone,
} from '@kolek/ui';
import { useState } from 'react';

/**
 * Écran de démonstration — voir la note de TableauDeBord.
 *
 * ---
 *
 * AVERTISSEMENT — cet écran dessine une action que la base refuse aujourd'hui.
 *
 * La politique RLS d'insertion sur `mises` exige `collecteur_id = auth.uid()`,
 * et le trigger `mises_avant_insert` réécrit de toute façon `collecteur_id`
 * depuis la carte. Un administrateur GTCS n'est pas le collecteur : sa session
 * ne peut pas produire cette écriture. Le brancher demanderait une Edge
 * Function à clé de service, et donc une décision — le cahier §11 pose que
 * l'argent est manié par le collecteur, pas par la plateforme.
 *
 * L'écran est donc présentationnel. Le bouton de confirmation ne soumet rien.
 *
 * Deux écarts assumés avec la maquette :
 *
 * - Elle affichait « Enregistré hors ligne · sera synchronisé dès rétablissement
 *   de la connexion ». C'est la copie de l'écran mobile du collecteur ; sur un
 *   poste d'administration, elle est fausse. Remplacée par la vraie raison pour
 *   laquelle rien ne part.
 * - Les montants rapides sont bornés par le moteur de calcul plutôt qu'écrits
 *   en dur : une carte n'accepte qu'une mise entre 500 et 10 000 FCFA.
 */
const MONTANTS_RAPIDES = [500, 1000, 2000, 5000, 10000].filter(validerMise);

const CLIENT = {
  nom: 'Mariam Koné',
  cycle: '3',
  jourCourant: 18,
  mise: 1000,
  solde: '18 000',
};

function Etape({
  numero,
  titre,
  children,
}: {
  numero: number;
  titre: string;
  children: React.ReactNode;
}) {
  return (
    <Carte className="p-6">
      <h2 className="font-headings font-bold text-xl text-ink mb-4">
        {numero}. {titre}
      </h2>
      {children}
    </Carte>
  );
}

function LigneResume({
  libelle,
  valeur,
  accent = false,
  derniere = false,
}: {
  libelle: string;
  valeur: string;
  accent?: boolean;
  derniere?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between ${
        derniere ? 'pt-2' : 'pb-3 border-b border-hairline'
      }`}
    >
      <span className="text-base font-body text-muted-foreground">{libelle}</span>
      <span
        className={`font-body font-semibold tabular-nums ${accent ? 'text-positive font-bold' : 'text-ink'}`}
      >
        {valeur}
      </span>
    </div>
  );
}

export function EncaisserMise() {
  const [montant, setMontant] = useState(CLIENT.mise);

  return (
    <>
      <BarreHaute
        filAriane={['Accueil', 'Collecteurs', 'Encaisser une mise']}
        titre="Enregistrer une mise"
        actions={[]}
      />

      <div className="px-8 py-6 overflow-y-auto">
        <div className="grid gap-6 grid-cols-1 xl:grid-cols-[1fr_420px]">
          {/* Formulaire */}
          <div className="flex flex-col gap-5">
            <Etape numero={1} titre="Sélectionner un client">
              <div className="flex items-center gap-2 bg-canvas border border-hairline rounded-md px-3 py-2.5 mb-4">
                <Icone nom="search" taille={16} className="text-muted-foreground" />
                <input
                  type="search"
                  placeholder="Rechercher un client…"
                  className="flex-1 bg-transparent text-base font-body text-ink placeholder:text-muted-foreground outline-none"
                />
              </div>

              <div className="bg-secondary/30 rounded-md border border-primary p-4 flex items-center gap-4">
                <Avatar nom={CLIENT.nom} className="w-14 h-14 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-headings font-bold text-lg text-ink">{CLIENT.nom}</p>
                  <div className="flex items-center gap-3 mt-1 flex-wrap">
                    <BadgeStatut statut="À jour" className="px-2.5 py-0.5" />
                    <span className="text-sm font-body text-muted-foreground">
                      Cycle {CLIENT.cycle} · Jour {CLIENT.jourCourant}/31
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  aria-label="Retirer ce client de la sélection"
                  className="w-8 h-8 rounded-pill flex items-center justify-center border border-hairline bg-surface flex-shrink-0"
                >
                  <Icone nom="x" taille={16} className="text-muted-foreground" />
                </button>
              </div>
            </Etape>

            <Etape numero={2} titre="Montant de la mise">
              <p className="text-sm font-body font-semibold text-muted-foreground mb-2">
                Montants rapides
              </p>
              <div className="grid grid-cols-5 gap-2 mb-5">
                {MONTANTS_RAPIDES.map((valeur) => (
                  <button
                    key={valeur}
                    type="button"
                    onClick={() => setMontant(valeur)}
                    aria-pressed={valeur === montant}
                    className={`px-3 py-2.5 rounded-md text-base font-body font-semibold border tabular-nums cursor-pointer ${
                      valeur === montant
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-canvas text-ink border-hairline'
                    }`}
                  >
                    {valeur.toLocaleString('fr-FR').replace(/ | /g, ' ')}
                  </button>
                ))}
              </div>

              <label
                htmlFor="montant-personnalise"
                className="text-sm font-body font-semibold text-ink mb-2 block"
              >
                Montant personnalisé
              </label>
              <div className="flex items-center gap-3 bg-canvas border-2 border-primary rounded-md px-4 py-3">
                <input
                  id="montant-personnalise"
                  type="number"
                  min={MISE_MIN}
                  max={MISE_MAX}
                  step={100}
                  value={montant}
                  onChange={(e) => setMontant(Number(e.target.value))}
                  className="flex-1 min-w-0 bg-transparent font-headings font-bold text-3xl text-ink tabular-nums outline-none"
                />
                <span className="text-lg font-body font-medium text-muted-foreground">FCFA</span>
              </div>
              {!validerMise(montant) && (
                <p role="alert" className="text-sm font-body text-negative mt-2">
                  Une mise se situe entre {formatFCFA(MISE_MIN)} et {formatFCFA(MISE_MAX)}.
                </p>
              )}
            </Etape>

            <Etape numero={3} titre="Note (optionnel)">
              <textarea
                rows={2}
                placeholder="Ajouter une note…"
                className="w-full bg-canvas border border-hairline rounded-md px-4 py-3 text-base font-body text-ink placeholder:text-muted-foreground outline-none resize-none"
              />
            </Etape>

            <Bouton
              pleineLargeur
              icone="check-circle"
              disabled
              className="rounded-lg! py-4 font-headings text-lg"
            >
              Confirmer &amp; Enregistrer — {formatFCFA(montant)}
            </Bouton>
          </div>

          {/* Aperçu */}
          <div className="flex flex-col gap-5">
            <div>
              <p className="text-sm font-body font-semibold text-muted-foreground mb-2">
                Aperçu de la carte
              </p>
              <CarteCollecte
                nomClient={CLIENT.nom}
                misePar={formatFCFA(CLIENT.mise).replace(' FCFA', '')}
                jourCourant={CLIENT.jourCourant}
                solde={CLIENT.solde}
                cycle={CLIENT.cycle}
              />
            </div>

            <Carte className="p-5">
              <h3 className="font-headings font-bold text-lg text-ink mb-4">Résumé</h3>
              <div className="flex flex-col gap-3">
                <LigneResume libelle="Client" valeur={CLIENT.nom} />
                <LigneResume
                  libelle="Cycle"
                  valeur={`${CLIENT.cycle} · Jour ${CLIENT.jourCourant}/31`}
                />
                <LigneResume libelle="Mise du jour" valeur={formatFCFA(montant)} />
                <LigneResume
                  libelle="Solde restituable"
                  valeur={`${CLIENT.solde} FCFA`}
                  accent
                />
                <div className="flex items-center justify-between pt-2">
                  <span className="text-sm font-body font-semibold text-muted-foreground">État</span>
                  <span className="px-2.5 py-0.5 rounded-pill text-xs font-body font-semibold bg-muted text-muted-foreground">
                    Écran de démonstration
                  </span>
                </div>
              </div>
            </Carte>

            <div className="bg-info-tint rounded-lg border border-info p-4">
              <div className="flex gap-3">
                <Icone nom="info" className="text-info flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-body font-semibold text-info mb-1">
                    Rien n'est enregistré depuis cet écran
                  </p>
                  <p className="text-xs font-body text-info/80">
                    Une mise appartient au collecteur qui l'encaisse : la base la refuse à toute
                    autre session. L'écriture côté administration demande une fonction serveur, et
                    d'abord une décision — voir le cahier §11.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
