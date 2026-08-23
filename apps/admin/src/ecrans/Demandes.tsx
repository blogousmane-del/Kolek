import { PALIERS, formatMontant } from '@kolek/core';
import { BarreHaute, Bouton, Carte, Icone } from '@kolek/ui';
import { useCallback, useEffect, useState } from 'react';

import { telechargerCsv, versCsv, dateDuJour } from '../exporter';
import { chargerDemandes, traiterDemande, type Demande, type StatutDemande } from '../demandes';

/**
 * Les demandes d'ouverture de compte.
 *
 * L'écran existe parce que le formulaire de la vitrine existe. Un formulaire
 * public qui enregistre dans une table que personne ne regarde est pire qu'un
 * `mailto:` : le visiteur croit avoir été entendu, et personne ne l'a entendu.
 *
 * L'ordre de la liste est celui du travail — les demandes non traitées d'abord,
 * les plus récentes en tête. Il vient de la base (`admin_demandes`), pas d'un
 * tri côté navigateur : c'est la même règle qui vaudra pour un futur export ou
 * une future notification.
 */

const LIBELLE: Record<StatutDemande, string> = {
  nouvelle: 'Nouvelle',
  contactee: 'Contactée',
  ouverte: 'Compte ouvert',
  refusee: 'Refusée',
};

const TEINTE: Record<StatutDemande, string> = {
  nouvelle: 'bg-info-tint text-info',
  contactee: 'bg-muted text-muted-foreground',
  ouverte: 'bg-positive-tint text-positive',
  refusee: 'bg-negative-tint text-negative',
};

function nomPalier(cle: string): string {
  return PALIERS.find((p) => p.cle === cle)?.nom ?? cle;
}

function prixPalier(cle: string): string {
  const palier = PALIERS.find((p) => p.cle === cle);
  if (!palier) return '—';
  return palier.prix === 0 ? 'Essai gratuit' : `${formatMontant(palier.prix)} FCFA/${palier.periode}`;
}

function quand(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function Demandes() {
  const [demandes, setDemandes] = useState<Demande[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState<string | null>(null);

  const relire = useCallback(async () => {
    try {
      setDemandes(await chargerDemandes());
      setErreur(null);
    } catch (cause) {
      setErreur(cause instanceof Error ? cause.message : 'Lecture impossible.');
    }
  }, []);

  useEffect(() => {
    void relire();
  }, [relire]);

  // `Exclude<…, 'nouvelle'>` : on ne remet jamais une demande à l'état neuf.
  // Le retour en arrière effacerait la date et le nom du traitant, que la
  // contrainte `demandes_traitement_coherent` exige dès qu'on quitte « nouvelle ».
  async function marquer(demande: Demande, statut: Exclude<StatutDemande, 'nouvelle'>) {
    if (enCours) return;
    setEnCours(demande.id);
    setErreur(null);

    const resultat = await traiterDemande(demande.id, statut);
    setEnCours(null);

    if (!resultat.ok) {
      setErreur(resultat.message);
      return;
    }
    await relire();
  }

  function exporter() {
    if (!demandes?.length) return;
    telechargerCsv(
      `demandes-kolek-${dateDuJour()}.csv`,
      versCsv(
        ['Nom', 'Téléphone', 'Zone', 'Offre', 'Statut', 'Reçue le', 'Message'],
        demandes.map((d) => [
          d.nom,
          d.telephone,
          d.zone ?? '',
          nomPalier(d.palier),
          LIBELLE[d.statut],
          quand(d.cree_le),
          d.message ?? '',
        ]),
      ),
    );
  }

  const nouvelles = demandes?.filter((d) => d.statut === 'nouvelle').length ?? 0;

  return (
    <>
      <BarreHaute
        filAriane={[
          'Monétisation',
          demandes === null
            ? 'Demandes'
            : nouvelles > 0
              ? `Demandes · ${nouvelles} à rappeler`
              : 'Demandes',
        ]}
        titre="Demandes d’ouverture"
        actions={
          demandes?.length
            ? [{ libelle: 'Exporter CSV', icone: 'download', onActiver: exporter }]
            : []
        }
      />

      <div className="p-6 flex flex-col gap-4">
        {erreur && (
          <p role="alert" className="bg-negative-tint text-negative text-sm font-body p-3 rounded-md">
            {erreur}
          </p>
        )}

        {demandes === null && !erreur && (
          <p className="font-body text-sm text-muted-foreground py-8 text-center">Lecture…</p>
        )}

        {demandes?.length === 0 && (
          <Carte className="p-8 text-center">
            <p className="font-headings font-bold text-lg text-ink mb-1">Aucune demande</p>
            <p className="font-body text-sm text-muted-foreground">
              Les demandes déposées depuis le site apparaissent ici, les plus récentes d’abord.
            </p>
          </Carte>
        )}

        {demandes?.map((demande) => (
          <Carte
            key={demande.id}
            className={`p-5 ${demande.statut === 'nouvelle' ? 'border-info' : ''}`}
          >
            <div className="flex items-start justify-between gap-4 mb-3">
              <div className="min-w-0">
                <p className="font-headings font-bold text-lg text-ink truncate">{demande.nom}</p>
                <p className="font-body text-sm text-muted-foreground">
                  {demande.zone ? `${demande.zone} · ` : ''}
                  {quand(demande.cree_le)}
                </p>
              </div>
              <span
                className={`px-2.5 py-1 rounded-pill text-xs font-body font-semibold whitespace-nowrap shrink-0 ${TEINTE[demande.statut]}`}
              >
                {LIBELLE[demande.statut]}
              </span>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 mb-4">
              {/* Le numéro est cliquable : sur le poste d'un chargé de clientèle
                  avec un logiciel de téléphonie, `tel:` compose directement.
                  Ailleurs, il reste sélectionnable pour être recopié. */}
              <a
                href={`tel:${demande.telephone}`}
                className="flex items-center gap-2 bg-canvas rounded-md p-3 hover:bg-muted"
              >
                <Icone nom="phone" taille={16} className="text-primary shrink-0" />
                <span className="font-body font-semibold text-ink tabular-nums">
                  {demande.telephone}
                </span>
              </a>
              <div className="flex items-center gap-2 bg-canvas rounded-md p-3">
                <Icone nom="credit-card" taille={16} className="text-primary shrink-0" />
                <span className="font-body text-sm text-ink">
                  {nomPalier(demande.palier)}
                  <span className="text-muted-foreground"> · {prixPalier(demande.palier)}</span>
                </span>
              </div>
            </div>

            {demande.message && (
              <p className="font-body text-sm text-muted-foreground bg-canvas rounded-md p-3 mb-4 whitespace-pre-wrap">
                {demande.message}
              </p>
            )}

            {demande.statut === 'nouvelle' ? (
              <div className="flex flex-wrap gap-2">
                <Bouton
                  variante="contour"
                  onClick={() => void marquer(demande, 'contactee')}
                  disabled={enCours === demande.id}
                >
                  J’ai rappelé
                </Bouton>
                <Bouton
                  onClick={() => void marquer(demande, 'ouverte')}
                  disabled={enCours === demande.id}
                >
                  Compte ouvert
                </Bouton>
                <Bouton
                  variante="contour"
                  onClick={() => void marquer(demande, 'refusee')}
                  disabled={enCours === demande.id}
                >
                  Refuser
                </Bouton>
              </div>
            ) : (
              demande.statut === 'contactee' && (
                <div className="flex flex-wrap gap-2">
                  <Bouton
                    onClick={() => void marquer(demande, 'ouverte')}
                    disabled={enCours === demande.id}
                  >
                    Compte ouvert
                  </Bouton>
                  <Bouton
                    variante="contour"
                    onClick={() => void marquer(demande, 'refusee')}
                    disabled={enCours === demande.id}
                  >
                    Refuser
                  </Bouton>
                </div>
              )
            )}

            {demande.statut === 'nouvelle' && (
              <p className="font-body text-xs text-muted-foreground mt-3">
                Le compte se crée dans « Collecteurs » — ces informations servent à le
                pré-remplir.
              </p>
            )}
          </Carte>
        ))}
      </div>
    </>
  );
}
