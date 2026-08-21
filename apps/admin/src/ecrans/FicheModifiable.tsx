import { PALIERS } from '@kolek/core';
import { Bouton, Carte, Champ } from '@kolek/ui';
import { useState } from 'react';

import { modifierCollecteur, type LigneCollecteur } from '../donnees';

/**
 * Le formulaire de correction d'une fiche collecteur.
 *
 * ## Ce qu'il modifie, et ce qu'il ne modifie pas
 *
 * Cinq champs : nom, téléphone, zone, palier, statut d'abonnement.
 * **Pas l'échéance.** Repousser une date d'échéance revient à offrir du service ;
 * ce geste appartient à la facturation, pas à un écran de correction de fiche.
 * Le laisser passer ferait de la date une valeur d'opinion.
 *
 * ## Seuls les champs changés partent
 *
 * L'écran compare la saisie à la valeur d'origine et n'envoie que la différence.
 * Envoyer tout le formulaire écraserait la zone d'un collecteur avec une chaîne
 * vide si le champ n'avait pas été rechargé — et ce genre d'effacement ne se
 * remarque que le jour où on trie par zone.
 *
 * ## Le statut d'abonnement est ici, et c'est voulu
 *
 * C'est la réponse au refus de supprimer un compte qui a encaissé : « suspends
 * son abonnement à la place ». Un compte suspendu ne perd rien — ses mises, ses
 * cartes et son journal restent —, il cesse simplement de compter dans le revenu
 * récurrent. C'est le geste juste pour un collecteur qui s'arrête.
 */
export function FicheModifiable({
  collecteur,
  onEnregistre,
  onAnnuler,
}: {
  collecteur: LigneCollecteur;
  onEnregistre: () => void;
  onAnnuler: () => void;
}) {
  const [nom, setNom] = useState(collecteur.nom);
  const [telephone, setTelephone] = useState(collecteur.telephone);
  const [zone, setZone] = useState(collecteur.zone ?? '');
  const [palier, setPalier] = useState(collecteur.palier);
  const [statut, setStatut] = useState<string>(collecteur.abonnement_statut);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const changements: Record<string, string> = {};
  if (nom.trim() !== collecteur.nom) changements.nom = nom;
  if (telephone.trim() !== collecteur.telephone) changements.telephone = telephone;
  if (zone.trim() !== (collecteur.zone ?? '')) changements.zone = zone;
  if (palier !== collecteur.palier) changements.palier = palier;
  if (statut !== collecteur.abonnement_statut) changements.abonnementStatut = statut;

  const nombreChangements = Object.keys(changements).length;

  async function enregistrer() {
    if (envoi || nombreChangements === 0) return;
    setEnvoi(true);
    setErreur(null);

    const resultat = await modifierCollecteur(collecteur.id, changements);

    setEnvoi(false);
    if (!resultat.ok) {
      setErreur(resultat.message);
      return;
    }
    onEnregistre();
  }

  return (
    <Carte className="p-5">
      <h3 className="font-headings font-bold text-lg text-ink mb-4">Modifier la fiche</h3>

      {erreur && (
        <p
          role="alert"
          className="bg-negative-tint text-negative text-sm font-body p-3 rounded-md mb-4"
        >
          {erreur}
        </p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
        <Champ libelle="Nom" valeur={nom} onChange={setNom} />
        <Champ libelle="Téléphone" type="tel" valeur={telephone} onChange={setTelephone} />
        <Champ libelle="Zone" valeur={zone} onChange={setZone} />

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-body font-medium text-ink">Palier</span>
          <select
            value={palier}
            onChange={(e) => setPalier(e.target.value)}
            className="h-11 px-3 rounded-md border border-input bg-surface font-body text-sm text-ink cursor-pointer"
          >
            {PALIERS.map((p) => (
              <option key={p.cle} value={p.cle}>
                {p.nom}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-body font-medium text-ink">Abonnement</span>
          <select
            value={statut}
            onChange={(e) => setStatut(e.target.value)}
            className="h-11 px-3 rounded-md border border-input bg-surface font-body text-sm text-ink cursor-pointer"
          >
            <option value="actif">Actif</option>
            <option value="suspendu">Suspendu</option>
            <option value="expire">Expiré</option>
          </select>
        </label>
      </div>

      <p className="font-body text-xs text-muted-foreground mb-4">
        L’échéance de l’abonnement ne se modifie pas ici : la repousser revient à offrir du
        service, et cela relève de la facturation.
      </p>

      <div className="flex flex-wrap gap-2">
        <Bouton onClick={enregistrer} disabled={envoi || nombreChangements === 0}>
          {envoi
            ? 'Enregistrement…'
            : nombreChangements === 0
              ? 'Aucun changement'
              : `Enregistrer ${nombreChangements} changement${nombreChangements > 1 ? 's' : ''}`}
        </Bouton>
        <Bouton variante="contour" onClick={onAnnuler}>
          Annuler
        </Bouton>
      </div>
    </Carte>
  );
}
