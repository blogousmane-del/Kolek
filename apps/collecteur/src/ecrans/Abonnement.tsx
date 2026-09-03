import { PALIERS, formatMontant } from '@kolek/core';
import {
  Bouton,
  Carte,
  ChampTelephone,
  separerE164,
  useEnLigne,
  type ValeurTelephone,
} from '@kolek/ui';
import { useState } from 'react';

import { demarrerPaiement } from '../abonnement';
import { CorpsEcran, EnTeteEcran } from './EnTeteEcran';

/**
 * Régler son abonnement.
 *
 * Trois propriétés de cet écran méritent d'être dites, parce qu'elles ne se
 * voient pas :
 *
 * 1. **Aucun montant ne part d'ici.** L'écran affiche les prix de la grille,
 *    mais n'envoie qu'un nom de palier. Le prix débité est celui du produit
 *    configuré chez le fournisseur — c'est lui qui fait foi, et le laisser
 *    décider est ce qui rend impossible un débit fabriqué depuis le téléphone.
 * 2. **C'est le seul geste du produit qui exige le réseau.** Tout le reste est
 *    pensé hors-ligne d'abord. Le bouton le dit plutôt que de laisser partir un
 *    appel qui échouera.
 * 3. **Le numéro de la fiche est repris par `separerE164`, jamais tel quel.**
 *    `collecteurs.telephone` porte un numéro international ; le poser dans la
 *    partie « numéro national » du champ ferait recomposer « +225 » devant un
 *    numéro qui porte déjà son indicatif — un numéro faux, que le champ
 *    déclarerait valide, et que le collecteur ne relirait pas puisqu'il est
 *    déjà écrit. Quand la fiche ne porte pas de forme internationale, le champ
 *    reste vide : mieux vaut une saisie qu'une supposition.
 */

const PAYANTS = PALIERS.filter((p) => p.prix > 0);

/** Le pays par défaut : celui du pilote. */
const PAYS_DEFAUT = 'CI';

function departDuChamp(telephoneCollecteur: string): ValeurTelephone {
  const separe = separerE164(telephoneCollecteur);
  return {
    pays: separe?.pays ?? PAYS_DEFAUT,
    local: separe?.local ?? '',
    e164: '',
    // Faux tant que le champ n'a pas remonté sa propre lecture : c'est lui qui
    // juge de la validité, et lui seul. Un pré-remplissage déclaré valide
    // d'avance laisserait payer sans que le numéro ait jamais été mesuré.
    valide: false,
  };
}

export function Abonnement({
  palierCourant,
  telephoneCollecteur,
  onRetour,
}: {
  palierCourant: string;
  telephoneCollecteur: string;
  onRetour: () => void;
}) {
  const enLigne = useEnLigne();
  const [choisi, setChoisi] = useState(palierCourant === 'essai' ? 'pro' : palierCourant);
  const [telephone, setTelephone] = useState<ValeurTelephone>(() =>
    departDuChamp(telephoneCollecteur),
  );
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  async function payer() {
    setErreur(null);
    setEnCours(true);

    const resultat = await demarrerPaiement({
      palier: choisi,
      telephone: telephone.e164,
      paysTelephone: telephone.pays,
      telephoneLocal: telephone.local,
    });

    if (!resultat.ok) {
      setErreur(resultat.message);
      setEnCours(false);
      return;
    }

    // Navigation de premier niveau, et non `fetch` : la page de paiement est
    // hébergée par le fournisseur, et la CSP ne l'autoriserait pas en
    // `connect-src`.
    window.location.assign(resultat.checkoutUrl);
  }

  const pretAPayer = enLigne && telephone.valide && !enCours;

  return (
    <div className="flex-1 flex flex-col">
      <EnTeteEcran titre="Abonnement" sousTitre="Régler par Mobile Money" onRetour={onRetour} />

      <CorpsEcran
        enfants={
          <>
            {!enLigne && (
              <Carte>
                <p className="font-body text-sm text-ink">
                  Le paiement a besoin du réseau. Reviens ici une fois connecté — ta tournée, elle,
                  continue sans.
                </p>
              </Carte>
            )}

            {PAYANTS.map((palier) => {
              const actif = palier.cle === choisi;
              return (
                <button
                  key={palier.cle}
                  type="button"
                  onClick={() => setChoisi(palier.cle)}
                  aria-pressed={actif}
                  className={`w-full text-left rounded-lg border-[1.5px] p-4 cursor-pointer ${
                    actif ? 'border-primary bg-surface' : 'border-hairline bg-surface'
                  }`}
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-headings font-bold text-lg text-ink">{palier.nom}</span>
                    <span className="font-headings font-bold text-lg text-primary">
                      {formatMontant(palier.prix)} FCFA
                    </span>
                  </div>
                  <p className="font-body text-sm text-muted-foreground mt-1">
                    {palier.limite} · par {palier.periode}
                  </p>
                </button>
              );
            })}

            <Carte>
              <ChampTelephone
                libelle="Numéro Mobile Money"
                valeur={{ pays: telephone.pays, local: telephone.local }}
                onChange={setTelephone}
              />
            </Carte>

            {erreur && (
              <Carte>
                <p className="font-body text-sm text-ink">{erreur}</p>
              </Carte>
            )}

            <Bouton
              pleineLargeur
              disabled={!pretAPayer}
              title={
                !enLigne
                  ? 'Le paiement a besoin du réseau.'
                  : !telephone.valide
                    ? 'Saisis un numéro complet.'
                    : undefined
              }
              onClick={() => void payer()}
            >
              {enCours ? 'Ouverture du paiement…' : 'Payer 30 jours'}
            </Bouton>

            <p className="font-body text-xs text-muted-foreground text-center">
              Le paiement se fait sur la page sécurisée de notre encaisseur. Ton abonnement s’active
              dès le règlement confirmé.
            </p>
          </>
        }
      />
    </div>
  );
}
