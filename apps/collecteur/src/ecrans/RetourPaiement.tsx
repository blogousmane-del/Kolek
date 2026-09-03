import { Bouton, Carte } from '@kolek/ui';
import { useEffect, useRef, useState } from 'react';

import { verifierPaiements } from '../abonnement';
import { CorpsEcran, EnTeteEcran } from './EnTeteEcran';

/**
 * Le retour depuis la page de paiement.
 *
 * **Rien n'est conclu depuis l'URL.** Le fournisseur peut y poser un `status`,
 * et un collecteur peut le réécrire : c'est un indice, jamais une preuve. Le
 * seul verdict vient du serveur, qui relit la vente chez l'encaisseur.
 *
 * Le sondage s'arrête au bout d'une minute. Passé ce délai, l'écran ne ment
 * pas : il dit que la confirmation prendra un moment et que l'abonnement
 * s'activera seul — ce qui est vrai, le webhook et la prochaine ouverture s'en
 * chargeront.
 */

const INTERVALLE_MS = 3000;
const LIMITE_MS = 60000;

type Etat = { phase: 'attente' } | { phase: 'credite'; echeance: string | null } | { phase: 'lent' };

function dateLisible(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export function RetourPaiement({ onTermine }: { onTermine: () => void }) {
  const [etat, setEtat] = useState<Etat>({ phase: 'attente' });
  const depart = useRef(Date.now());

  useEffect(() => {
    let vivant = true;
    let minuteur: ReturnType<typeof setTimeout>;

    async function sonder() {
      const resultat = await verifierPaiements();
      if (!vivant) return;

      if (resultat.credites > 0) {
        setEtat({ phase: 'credite', echeance: resultat.echeance });
        return;
      }
      if (Date.now() - depart.current >= LIMITE_MS) {
        setEtat({ phase: 'lent' });
        return;
      }
      minuteur = setTimeout(() => void sonder(), INTERVALLE_MS);
    }

    void sonder();
    return () => {
      vivant = false;
      clearTimeout(minuteur);
    };
  }, []);

  return (
    <div className="flex-1 flex flex-col">
      <EnTeteEcran titre="Paiement" sousTitre="Confirmation" onRetour={onTermine} />

      <CorpsEcran
        enfants={
          <>
            {etat.phase === 'attente' && (
              <Carte>
                <p className="font-headings font-bold text-lg text-ink mb-1">
                  Confirmation en cours…
                </p>
                <p className="font-body text-sm text-muted-foreground">
                  On vérifie le règlement auprès de l’encaisseur. Ne ferme pas l’application.
                </p>
              </Carte>
            )}

            {etat.phase === 'credite' && (
              <Carte>
                <p className="font-headings font-bold text-lg text-ink mb-1">Abonnement actif</p>
                <p className="font-body text-sm text-muted-foreground">
                  {etat.echeance
                    ? `Ton abonnement court jusqu’au ${dateLisible(etat.echeance)}.`
                    : 'Ton abonnement est à jour.'}
                </p>
              </Carte>
            )}

            {etat.phase === 'lent' && (
              <Carte>
                <p className="font-headings font-bold text-lg text-ink mb-1">
                  Confirmation en attente
                </p>
                <p className="font-body text-sm text-muted-foreground">
                  Le règlement met plus de temps que d’habitude à nous parvenir. Si tu as bien payé,
                  ton abonnement s’activera tout seul — rouvre l’application dans un moment. Rien à
                  refaire, et surtout ne paie pas deux fois.
                </p>
              </Carte>
            )}

            <Bouton pleineLargeur variante="contour" onClick={onTermine}>
              Revenir au carnet
            </Bouton>
          </>
        }
      />
    </div>
  );
}
