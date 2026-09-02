import { PALIERS, formatMontant } from '@kolek/core';
import { Bouton, Carte, Icone, Squelette, useEnLigne } from '@kolek/ui';

import { useDonnees } from '../cache';
import { chargerProfil } from '../lectures-ecrans';
import { CorpsEcran, EnTeteEcran } from './EnTeteEcran';

/**
 * « Plus » : la fiche du collecteur, son abonnement, l'état de l'application.
 *
 * L'écran ne propose **aucune modification**. Ce n'est pas un manque : les
 * colonnes `nom`, `telephone` et `zone` de `collecteurs` sont bien ouvertes en
 * écriture au collecteur, mais `palier` et `abonnement_*` ne le sont pas — c'est
 * GTCS qui les fixe. Un formulaire qui mêlerait les deux laisserait croire qu'on
 * peut changer d'offre depuis son téléphone.
 *
 * L'état du réseau est montré parce qu'il explique la moitié des questions qu'un
 * collecteur se pose : pourquoi un chiffre ne bouge pas, pourquoi une mise
 * semble perdue.
 */
export function Plus({ onRetour, onDeconnexion }: {
  onRetour: () => void;
  onDeconnexion: () => void;
}) {
  const { donnees: profil, erreur } = useDonnees('profil', chargerProfil, {
    messageErreur: 'Fiche indisponible. Vérifie le réseau.',
  });
  const enLigne = useEnLigne();

  const tarif = PALIERS.find((p) => p.cle === profil?.palier);

  return (
    <div className="flex-1 flex flex-col">
      <EnTeteEcran
        titre="Plus"
        sousTitre={profil?.nom ?? 'Ta fiche'}
        onRetour={onRetour}
        largeur="liste"
      />

      <CorpsEcran
        largeur="liste"
        enfants={
          <>
            {erreur && (
              <p role="alert" className="bg-negative-tint text-negative text-sm font-body p-3 rounded-md">
                {erreur}
              </p>
            )}

            {!profil && !erreur && (
              <div className="space-y-4">
                <Carte className="p-5 space-y-3">
                  <Squelette hauteur="h-5" largeur="w-24" />
                  <Squelette hauteur="h-4" largeur="w-full" />
                  <Squelette hauteur="h-4" largeur="w-3/4" />
                  <Squelette hauteur="h-4" largeur="w-1/2" />
                </Carte>
                <Carte className="p-5 space-y-3">
                  <Squelette hauteur="h-5" largeur="w-32" />
                  <Squelette hauteur="h-4" largeur="w-full" />
                  <Squelette hauteur="h-4" largeur="w-2/3" />
                </Carte>
              </div>
            )}

            {profil && (
              <>
                {/* Identité et abonnement côte à côte sur bureau : ce sont deux
                    sujets distincts, et les empiler sur 1 440 px laisse la moitié
                    droite vide. `items-start` pour que la carte la plus courte ne
                    s'étire pas à la hauteur de l'autre. */}
                <div className="space-y-4 lg:grid lg:grid-cols-2 lg:gap-4 lg:space-y-0 lg:items-start">
                <Carte className="p-4">
                  <p className="font-headings font-bold text-base text-ink mb-3">Ma fiche</p>
                  <dl className="text-sm font-body space-y-2">
                    <Ligne terme="Nom" valeur={profil.nom} />
                    <Ligne terme="Téléphone" valeur={profil.telephone || '—'} />
                    <Ligne terme="Zone" valeur={profil.zone || 'Non renseignée'} />
                    <Ligne terme="Clients" valeur={String(profil.clients)} />
                    <Ligne terme="Cartes actives" valeur={String(profil.cartesActives)} />
                  </dl>
                  <p className="font-body text-xs text-muted-foreground mt-3 pt-3 border-t border-hairline">
                    Pour corriger ton nom, ton téléphone ou ta zone, contacte GTCS.
                  </p>
                </Carte>

                <Carte className="p-4">
                  <p className="font-headings font-bold text-base text-ink mb-3">Mon abonnement</p>
                  <dl className="text-sm font-body space-y-2">
                    <Ligne terme="Formule" valeur={tarif?.nom ?? profil.palier} />
                    {/* Un collaborateur doit pouvoir constater pourquoi sa
                        commission n’apparaît nulle part. Sans cette ligne, la
                        règle est appliquée sur quatre écrans et énoncée sur
                        aucun. */}
                    {profil.titulaireId && (
                      <Ligne
                        terme="Équipe"
                        valeur="Collaborateur — la commission revient à ton titulaire"
                      />
                    )}
                    {tarif && (
                      <Ligne
                        terme="Tarif"
                        valeur={
                          tarif.prix === 0 ? 'Gratuit' : `${formatMontant(tarif.prix)} FCFA / mois`
                        }
                      />
                    )}
                    {tarif && (
                      <Ligne
                        terme="Limite"
                        valeur={
                          tarif.limiteClients === null
                            ? 'Clients illimités'
                            : `${tarif.limiteClients} clients`
                        }
                      />
                    )}
                    <Ligne terme="Statut" valeur={profil.abonnementStatut} />
                    <Ligne
                      terme="Échéance"
                      valeur={
                        profil.abonnementEcheance
                          ? new Date(profil.abonnementEcheance).toLocaleDateString('fr-FR', {
                              day: 'numeric',
                              month: 'long',
                              year: 'numeric',
                            })
                          : '—'
                      }
                    />
                  </dl>
                  <p className="font-body text-xs text-muted-foreground mt-3 pt-3 border-t border-hairline">
                    Le changement de formule se fait auprès de GTCS, pas depuis l’application.
                  </p>
                </Carte>
                </div>

                <Carte className="p-4">
                  <p className="font-headings font-bold text-base text-ink mb-3">Application</p>
                  <div className="flex items-center gap-2 mb-2">
                    <Icone
                      nom={enLigne ? 'check-circle' : 'wifi-off'}
                      taille={18}
                      className={enLigne ? 'text-positive' : 'text-negative'}
                    />
                    <span className="font-body text-sm text-ink">
                      {enLigne ? 'Connecté au serveur' : 'Hors ligne'}
                    </span>
                  </div>
                  <p className="font-body text-xs text-muted-foreground">
                    {enLigne
                      ? 'Tes encaissements partent au serveur au moment où tu les enregistres.'
                      : 'Sans réseau, les écrans montrent la dernière lecture connue et aucun encaissement ne peut être enregistré.'}
                  </p>
                </Carte>

                <Carte className="p-4">
                  <p className="font-headings font-bold text-base text-ink mb-1">Se déconnecter</p>
                  <p className="font-body text-sm text-muted-foreground mb-4">
                    À faire si tu prêtes ce téléphone : sans ça, la session reste ouverte et tout
                    ton portefeuille est lisible.
                  </p>
                  <Bouton variante="contour" icone="log-out" onClick={onDeconnexion}>
                    Se déconnecter
                  </Bouton>
                </Carte>
              </>
            )}
          </>
        }
      />
    </div>
  );
}

function Ligne({ terme, valeur }: { terme: string; valeur: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted-foreground shrink-0">{terme}</dt>
      <dd className="text-ink font-medium text-right truncate">{valeur}</dd>
    </div>
  );
}
