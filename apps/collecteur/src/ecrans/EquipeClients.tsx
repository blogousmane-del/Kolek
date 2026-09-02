import { formatMontant } from '@kolek/core';
import { Bouton, Carte, SqueletteLigne } from '@kolek/ui';
import { useState } from 'react';

import { useDonnees } from '../cache';
import { encaisserPour } from '../ecritures-ecrans';
import { chargerClientsCollaborateur, type CarteCoequipier } from '../lectures-ecrans';
import { CorpsEcran, EnTeteEcran } from './EnTeteEcran';

/**
 * La tournée d'un coéquipier, et son encaissement.
 *
 * ## Le bandeau n'est pas décoratif
 *
 * Cet écran ressemble trait pour trait à la liste des clients du collecteur :
 * mêmes noms, mêmes cartes, même bouton. Sans une mention permanente de la
 * personne dont ce sont les clients, on encaisse chez quelqu'un d'autre sans le
 * savoir — et l'argent tombe dans la mauvaise caisse du soir sans que rien ne
 * l'ait signalé.
 *
 * ## Pourquoi le réseau est obligatoire ici, et nulle part ailleurs
 *
 * `collecteur-encaisser-pour` est une Edge Function. Elle existe parce que la
 * policy `mises_insert` exige `collecteur_id = auth.uid()` et qu'elle **n'a pas
 * été élargie** : le dépannage passe par une porte dédiée plutôt que par un
 * assouplissement de l'isolation.
 *
 * La conséquence se paie ici. Rien n'entre dans la file de synchro, donc rien ne
 * partira à la reconnexion, et `BandeauHorsLigne` — qui promet « les
 * encaissements seront synchronisés dès connexion » — serait un mensonge sur cet
 * écran précis. D'où la phrase dédiée, qui dit la limite et rappelle qu'elle ne
 * vaut que là.
 */
export function EquipeClients({
  collaborateur,
  enLigne,
  revision,
  onRetour,
  onEcriture,
}: {
  collaborateur: { id: string; nom: string };
  /** Reçu plutôt que lu ici : c'est ce qui rend l'écran testable sans simuler
      `navigator`, et la coquille le tient déjà pour les autres écrans. */
  enLigne: boolean;
  revision: number;
  onRetour: () => void;
  onEcriture: () => void;
}) {
  const { donnees: clients, erreur } = useDonnees(
    `equipe-clients:${collaborateur.id}`,
    () => chargerClientsCollaborateur(collaborateur.id),
    { revision, messageErreur: 'Tournée indisponible. Vérifie le réseau.' },
  );

  return (
    <div className="flex-1 flex flex-col">
      <EnTeteEcran
        titre={collaborateur.nom}
        sousTitre="Sa tournée — tu encaisses à sa place"
        onRetour={onRetour}
      />

      <CorpsEcran
        enfants={
          <>
            {/* Permanent, et non un titre qui défile : c'est la seule chose qui
                distingue cet écran de sa propre liste de clients. */}
            <p className="font-body text-sm text-ink bg-secondary rounded-xl px-3 py-2 border border-hairline/60">
              Clients de <span className="font-semibold">{collaborateur.nom}</span>. Ce que tu
              encaisses ici entre dans <span className="font-semibold">ta</span> caisse du soir.
            </p>

            {erreur && (
              <p role="alert" className="text-sm font-body text-negative">
                {erreur}
              </p>
            )}

            {clients === null && !erreur && (
              <>
                <SqueletteLigne />
                <SqueletteLigne />
              </>
            )}

            {clients !== null && clients.length === 0 && (
              <p className="font-body text-sm text-muted-foreground text-center py-8">
                Aucun client pour l’instant. {collaborateur.nom} n’a encore inscrit personne.
              </p>
            )}

            {(clients ?? []).map((client) => (
              <Carte key={client.id} className="p-4">
                <p className="font-headings font-bold text-base text-ink">{client.nom}</p>
                {client.telephone && (
                  <p className="font-body text-xs text-muted-foreground">{client.telephone}</p>
                )}

                <div className="mt-3 space-y-2">
                  {client.cartes.map((carte) => (
                    <LigneCarte
                      key={carte.id}
                      carte={carte}
                      enLigne={enLigne}
                      onEncaisse={onEcriture}
                    />
                  ))}
                  {client.cartes.length === 0 && (
                    <p className="font-body text-xs text-muted-foreground">
                      Aucune carte active. Ouvrir une carte reste le geste de {collaborateur.nom}.
                    </p>
                  )}
                </div>
              </Carte>
            ))}

            {!enLigne && (
              <p className="font-body text-sm text-negative text-center">
                Encaisser pour un coéquipier demande une connexion. Ta propre tournée, elle,
                fonctionne hors ligne.
              </p>
            )}
          </>
        }
      />
    </div>
  );
}

/** Une carte active, et le bouton qui encaisse dessus. */
function LigneCarte({
  carte,
  enLigne,
  onEncaisse,
}: {
  carte: CarteCoequipier;
  enLigne: boolean;
  onEncaisse: () => void;
}) {
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [fait, setFait] = useState(false);

  async function encaisser() {
    setEnvoi(true);
    setErreur(null);
    const resultat = await encaisserPour(carte.id, carte.mise);
    setEnvoi(false);
    if (!resultat.ok) {
      setErreur(resultat.echec.message);
      return;
    }
    setFait(true);
    onEncaisse();
  }

  return (
    <div className="rounded-xl border border-hairline/60 p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="font-body text-sm text-ink tabular-nums">
            {formatMontant(carte.mise)} FCFA / jour
          </p>
          <p className="font-body text-xs text-muted-foreground tabular-nums">
            {carte.misesEncaissees}/31 · solde {formatMontant(carte.soldeRestituable)} FCFA
          </p>
        </div>
        <Bouton onClick={encaisser} disabled={!enLigne || envoi || fait}>
          {fait ? 'Encaissé' : envoi ? 'Envoi…' : `Encaisser ${formatMontant(carte.mise)}`}
        </Bouton>
      </div>

      {erreur && (
        <p role="alert" className="font-body text-sm text-negative mt-2">
          {erreur}
        </p>
      )}
    </div>
  );
}
