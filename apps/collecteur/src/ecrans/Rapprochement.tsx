import { formatMontant } from '@kolek/core';
import { Bouton, Carte, Champ, Icone } from '@kolek/ui';
import { useEffect, useState } from 'react';

import { declarerCaisse } from '../ecritures-ecrans';
import { chargerRapprochement, type Rapprochement as Donnees } from '../lectures-ecrans';
import { CorpsEcran, EnTeteEcran } from './EnTeteEcran';

/**
 * Rapprochement de caisse : ce que le collecteur a en main, ce qu'il devrait avoir.
 *
 * **Le collecteur ne saisit qu'un seul nombre**, et c'est délibéré jusque dans le
 * schéma : `authenticated` n'a le droit d'écrire que `cash_declare`.
 * `cash_attendu` est posé par un déclencheur depuis les mises du jour, et `ecart`
 * est une colonne engendrée. Si le collecteur pouvait toucher à l'attendu, un
 * manquant de caisse se masquerait en une requête — il suffirait de recopier le
 * déclaré dans l'attendu.
 *
 * **L'écart n'est pas une accusation.** Il est nommé et expliqué : un écart
 * négatif peut être une mise oubliée sur le téléphone autant qu'un billet
 * manquant. L'écran dit les deux, parce qu'un collecteur qui craint l'écran
 * cesse de déclarer.
 */
export function Rapprochement({ collecteurId, onRetour }: {
  collecteurId: string | null;
  onRetour: () => void;
}) {
  const [donnees, setDonnees] = useState<Donnees | null>(null);
  const [saisie, setSaisie] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let vivant = true;
    void (async () => {
      try {
        const r = await chargerRapprochement();
        if (!vivant) return;
        setDonnees(r);
        if (r.cashDeclare !== null) setSaisie(String(r.cashDeclare));
      } catch {
        if (vivant) setErreur('Caisse indisponible. Vérifie le réseau.');
      }
    })();
    return () => {
      vivant = false;
    };
  }, [revision]);

  async function enregistrer() {
    if (!donnees || !collecteurId || envoi) return;
    const montant = Number.parseInt(saisie.replace(/\s/g, ''), 10);
    if (!Number.isInteger(montant) || montant < 0) {
      setErreur('Entre le montant en francs, sans centimes.');
      return;
    }

    setEnvoi(true);
    setErreur(null);
    const resultat = await declarerCaisse(collecteurId, donnees.date, montant, donnees.ligneId);
    setEnvoi(false);

    if (!resultat.ok) {
      setErreur(resultat.echec.message);
      return;
    }
    setRevision((r) => r + 1);
  }

  const ecart = donnees?.ecart;
  const dejaDeclare = donnees?.cashDeclare !== null && donnees?.cashDeclare !== undefined;

  return (
    <div className="flex-1 flex flex-col">
      <EnTeteEcran
        titre="Rapprochement"
        sousTitre="Ta caisse du jour"
        onRetour={onRetour}
        enfants={
          donnees && (
            <div className="bg-white/10 rounded-lg p-4">
              <p className="text-white/60 text-xs font-body mb-0.5">
                Cash attendu — calculé par le serveur
              </p>
              <p className="text-white font-headings font-bold text-3xl tabular-nums">
                {formatMontant(donnees.cashAttendu)}{' '}
                <span className="text-base font-body font-medium text-white/60">FCFA</span>
              </p>
              <p className="text-white/50 text-xs font-body mt-1">
                Somme de tes mises du {donnees.date}
              </p>
            </div>
          )
        }
      />

      <CorpsEcran
        enfants={
          <>
            {erreur && (
              <p role="alert" className="bg-negative-tint text-negative text-sm font-body p-3 rounded-md">
                {erreur}
              </p>
            )}

            {!donnees && !erreur && (
              <p className="font-body text-sm text-muted-foreground text-center py-8">Lecture…</p>
            )}

            {donnees && (
              <Carte className="p-4">
                <p className="font-headings font-bold text-base text-ink mb-1">
                  Compte ce que tu as en main
                </p>
                <p className="font-body text-sm text-muted-foreground mb-4">
                  Billets et pièces, tout ce que tu portes pour Kolek aujourd’hui.
                </p>

                {/* `tel` et non `number` : sur un téléphone, il ouvre le pavé
                    numérique sans les flèches d'incrément, que personne ne veut
                    sur un montant en francs. */}
                <Champ
                  libelle="Cash déclaré (FCFA)"
                  type="tel"
                  valeur={saisie}
                  onChange={setSaisie}
                />

                <div className="mt-4">
                  <Bouton onClick={enregistrer} disabled={envoi || saisie.trim() === ''}>
                    {envoi ? 'Enregistrement…' : dejaDeclare ? 'Corriger ma déclaration' : 'Déclarer'}
                  </Bouton>
                </div>
              </Carte>
            )}

            {donnees && ecart !== null && ecart !== undefined && (
              <Carte
                className={`p-4 ${ecart === 0 ? 'border-positive' : 'border-negative'}`}
              >
                <div className="flex items-center gap-2 mb-2">
                  <Icone
                    nom={ecart === 0 ? 'check-circle' : 'alert-circle'}
                    taille={20}
                    className={ecart === 0 ? 'text-positive' : 'text-negative'}
                  />
                  <p className="font-headings font-bold text-base text-ink">
                    {ecart === 0 ? 'Caisse juste' : 'Écart de caisse'}
                  </p>
                </div>

                {ecart !== 0 && (
                  <>
                    <p
                      className={`font-headings font-bold text-2xl tabular-nums mb-2 ${
                        ecart > 0 ? 'text-info' : 'text-negative'
                      }`}
                    >
                      {ecart > 0 ? '+' : '−'}
                      {formatMontant(Math.abs(ecart))}{' '}
                      <span className="text-sm font-body font-medium">FCFA</span>
                    </p>
                    <p className="font-body text-sm text-muted-foreground">
                      {ecart > 0
                        ? 'Tu as plus que prévu. Le plus souvent : une mise encaissée mais pas encore enregistrée sur le téléphone.'
                        : 'Tu as moins que prévu. Le plus souvent : une mise enregistrée deux fois, ou un billet resté ailleurs. Recompte avant de conclure.'}
                    </p>
                  </>
                )}

                {ecart === 0 && (
                  <p className="font-body text-sm text-muted-foreground">
                    Ce que tu portes correspond exactement à tes mises du jour.
                  </p>
                )}
              </Carte>
            )}

            <p className="font-body text-xs text-muted-foreground px-1">
              Le montant attendu est calculé par le serveur à partir de tes mises. Tu ne peux pas
              le modifier — c’est ce qui rend l’écart crédible, pour toi comme pour GTCS.
            </p>
          </>
        }
      />
    </div>
  );
}
