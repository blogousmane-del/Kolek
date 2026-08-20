import { formatMontant } from '@kolek/core';
import { Carte, Icone } from '@kolek/ui';
import { useEffect, useState } from 'react';

import { chargerRecus, type Recu } from '../lectures-ecrans';
import { CorpsEcran, EnTeteEcran, RienAMontrer } from './EnTeteEcran';

/**
 * Les reçus : la preuve de ce qui a été encaissé.
 *
 * Ce que cet écran remplace, c'est le carnet à souche. Un client qui conteste
 * une mise veut entendre trois choses : la date, le montant, et un numéro qu'on
 * puisse retrouver. Les trois sont là.
 *
 * **Le numéro est l'identifiant de la mise, abrégé.** Il est engendré par le
 * téléphone au moment du geste — c'est ce qui empêche un rejeu de synchro de
 * compter deux fois. Ce n'est donc pas un numéro d'ordre, et ça ne peut pas
 * l'être : deux collecteurs encaissent en même temps, et un compteur croissant
 * tenu côté téléphone se contredirait à la remontée.
 *
 * **Pas de bouton « imprimer ».** Rien dans l'application ne parle à une
 * imprimante, et un bouton qui n'imprime pas serait exactement le défaut qu'on
 * a passé la journée à retirer d'ici.
 */
export function Recus({ onRetour }: { onRetour: () => void }) {
  const [recus, setRecus] = useState<Recu[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [ouvert, setOuvert] = useState<string | null>(null);

  useEffect(() => {
    let vivant = true;
    void (async () => {
      try {
        const r = await chargerRecus();
        if (vivant) setRecus(r);
      } catch {
        if (vivant) setErreur('Reçus indisponibles. Vérifie le réseau.');
      }
    })();
    return () => {
      vivant = false;
    };
  }, []);

  return (
    <div className="flex-1 flex flex-col">
      <EnTeteEcran
        titre="Reçus"
        sousTitre={recus ? `${recus.length} derniers encaissements` : 'Historique'}
        onRetour={onRetour}
      />

      <CorpsEcran
        enfants={
          <>
            {erreur && (
              <p role="alert" className="bg-negative-tint text-negative text-sm font-body p-3 rounded-md">
                {erreur}
              </p>
            )}

            {!recus && !erreur && (
              <p className="font-body text-sm text-muted-foreground text-center py-8">Lecture…</p>
            )}

            {recus?.length === 0 && (
              <RienAMontrer
                icone="receipt"
                titre="Aucun encaissement"
                detail="Chaque mise enregistrée laisse ici un reçu, avec sa date et son numéro."
              />
            )}

            {recus?.map((recu) => {
              const quand = new Date(recu.encaisseLe);
              const estOuvert = ouvert === recu.id;

              return (
                <Carte key={recu.id} className="p-0 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setOuvert(estOuvert ? null : recu.id)}
                    className="w-full p-4 flex items-center gap-3 text-left cursor-pointer"
                  >
                    <div className="w-10 h-10 rounded-pill bg-positive-tint flex items-center justify-center shrink-0">
                      <Icone nom="receipt" taille={18} className="text-positive" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-body font-semibold text-sm text-ink truncate">
                        {recu.clientNom}
                      </p>
                      <p className="font-body text-xs text-muted-foreground">
                        {quand.toLocaleDateString('fr-FR')} ·{' '}
                        {quand.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-headings font-bold text-base text-ink tabular-nums">
                        {formatMontant(recu.montant)}
                      </p>
                      {recu.estCommission && (
                        <p className="text-xs font-body text-positive font-medium">commission</p>
                      )}
                    </div>
                    <Icone
                      nom={estOuvert ? 'chevron-down' : 'chevron-right'}
                      taille={18}
                      className="text-muted-foreground shrink-0"
                    />
                  </button>

                  {estOuvert && (
                    <div className="px-4 pb-4 pt-0 border-t border-hairline">
                      <dl className="text-sm font-body space-y-1.5 pt-3">
                        <div className="flex justify-between gap-3">
                          <dt className="text-muted-foreground">Numéro de reçu</dt>
                          <dd className="font-mono font-semibold text-ink">
                            {recu.id.slice(0, 8).toUpperCase()}
                          </dd>
                        </div>
                        <div className="flex justify-between gap-3">
                          <dt className="text-muted-foreground">Mise du carnet</dt>
                          <dd className="text-ink tabular-nums">
                            {formatMontant(recu.mise)} FCFA / jour
                          </dd>
                        </div>
                        <div className="flex justify-between gap-3">
                          <dt className="text-muted-foreground">Encaissé le</dt>
                          <dd className="text-ink">
                            {quand.toLocaleDateString('fr-FR', {
                              weekday: 'long',
                              day: 'numeric',
                              month: 'long',
                              year: 'numeric',
                            })}
                          </dd>
                        </div>
                        {recu.estCommission && (
                          <p className="text-xs text-muted-foreground pt-2">
                            Première mise de la carte : elle te revient, conformément au contrat du
                            client.
                          </p>
                        )}
                      </dl>
                    </div>
                  )}
                </Carte>
              );
            })}
          </>
        }
      />
    </div>
  );
}
