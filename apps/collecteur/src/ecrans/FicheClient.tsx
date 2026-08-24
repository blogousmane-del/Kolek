import { MISES_PAR_CYCLE, formatMontant, soldeRestituable } from '@kolek/core';
import { Bouton, CarteCollecte, Feuille, Icone, LigneTransaction } from '@kolek/ui';
import { useCallback, useEffect, useState } from 'react';

import type { CarteChoisie } from '../Coquille';
import { definirConsentementAvis, ouvrirCarte } from '../ecritures';
import { chargerFicheClient, type FicheClient as Fiche } from '../lectures-ecrans';
import { supabase } from '../supabase';
import { ChoixMise } from './ChoixMise';

/**
 * La fiche d'un client, en panneau flottant.
 *
 * ## Ce qu'elle remplace
 *
 * Rien — et c'est le problème qu'elle règle. La ligne d'un client portait son
 * nom, sa mise, son avancement et deux commandes, et c'était tout ce qu'on
 * pouvait savoir de lui sans quitter l'écran. Ses cartes passées, ses derniers
 * versements, son numéro : invisibles.
 *
 * ## Les trois gestes qu'elle rend possibles
 *
 * **Encaisser** — le même geste que depuis la liste, mais après avoir vu où en
 * est la carte.
 *
 * **Ouvrir une nouvelle carte** — après les 31 mises, après une restitution, ou
 * simplement pour changer de montant. La carte est l'unité qui se répète ; le
 * client, lui, ne s'inscrit qu'une fois.
 *
 * **Prévenir ou ne plus prévenir** — le consentement aux avis, recueilli là où
 * l'on a le client en face.
 *
 * ## Pourquoi les cartes clôturées restent affichées
 *
 * Parce qu'elles ne disparaissent pas de la vie du client. Une carte clôturée,
 * c'est un cycle qu'il a tenu — ou une restitution qu'il a demandée en cours de
 * route. Dans les deux cas il peut reprendre, et le collecteur doit pouvoir
 * dire « c'est ta quatrième carte » plutôt que de faire semblant que rien n'a
 * précédé.
 */
export function FicheClient({
  clientId,
  revision,
  onFermer,
  onEncaisser,
  onEcriture,
  onRetrait,
}: {
  clientId: string | null;
  revision: number;
  onFermer: () => void;
  onEncaisser: (carte: CarteChoisie) => void;
  onEcriture: () => void;
  /** Renvoie vers l'écran de clôture : c'est là que l'argent se rend. */
  onRetrait: () => void;
}) {
  const [fiche, setFiche] = useState<Fiche | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  const relire = useCallback(async () => {
    if (!clientId) return;
    try {
      const lue = await chargerFicheClient(clientId);
      if (lue === null) {
        setErreur('Fiche introuvable. Elle a peut-être été supprimée.');
        return;
      }
      setFiche(lue);
      setErreur(null);
    } catch {
      setErreur('Fiche indisponible. Vérifie le réseau.');
    }
  }, [clientId]);

  useEffect(() => {
    // La fiche précédente est effacée avant la lecture : sans ça, ouvrir un
    // second client montre un instant les chiffres du premier — et un solde
    // qui appartient à quelqu'un d'autre est la pire chose à afficher ici.
    setFiche(null);
    setErreur(null);
    void relire();
  }, [relire, revision]);

  const active = fiche?.cartes.find((k) => k.statut === 'active') ?? null;
  const complete = active !== null && active.misesEncaissees >= MISES_PAR_CYCLE;

  return (
    <Feuille
      titre={fiche?.nom ?? 'Fiche client'}
      sousTitre={fiche ? sousTitre(fiche) : undefined}
      ouverte={clientId !== null}
      onFermer={onFermer}
    >
      {erreur && (
        <p role="alert" className="bg-negative-tint text-negative text-sm font-body p-3 rounded-md">
          {erreur}
        </p>
      )}

      {!fiche && !erreur && (
        <p className="font-body text-sm text-muted-foreground text-center py-8">Lecture…</p>
      )}

      {fiche && (
        <>
          <Coordonnees fiche={fiche} onChange={onEcriture} onRelire={relire} />

          {active ? (
            <section>
              <p className="font-headings font-bold text-base text-ink mb-2">Carte en cours</p>
              <CarteCollecte
                nomClient={fiche.nom}
                misePar={formatMontant(active.mise)}
                jourCourant={active.misesEncaissees}
                solde={formatMontant(soldeRestituable(active.misesEncaissees, active.mise))}
                cycle={String(fiche.cartes.length)}
              />

              {complete ? (
                <div className="bg-positive-tint rounded-md p-3 mt-3">
                  <p className="font-body text-sm text-ink m-0">
                    Cycle terminé — {MISES_PAR_CYCLE} mises sur {MISES_PAR_CYCLE}.
                  </p>
                  <p className="font-body text-xs text-muted-foreground mt-1">
                    Rends-lui {formatMontant(soldeRestituable(active.misesEncaissees, active.mise))}{' '}
                    FCFA depuis « Retrait ». La nouvelle carte s’ouvre ensuite.
                  </p>
                  <Bouton variante="contour" className="mt-3" onClick={onRetrait}>
                    Aller au retrait
                  </Bouton>
                </div>
              ) : (
                <Bouton
                  pleineLargeur
                  className="mt-3"
                  icone="circle-dollar-sign"
                  onClick={() =>
                    onEncaisser({
                      carteId: active.id,
                      clientNom: fiche.nom,
                      mise: active.mise,
                      misesEncaissees: active.misesEncaissees,
                    })
                  }
                >
                  Encaisser {formatMontant(active.mise)} FCFA
                </Bouton>
              )}
            </section>
          ) : (
            <NouvelleCarte
              clientId={fiche.id}
              premiere={fiche.cartes.length === 0}
              onOuverte={() => {
                void relire();
                onEcriture();
              }}
            />
          )}

          {fiche.cartes.length > 1 && <Historique cartes={fiche.cartes} />}

          {fiche.mises.length > 0 && (
            <section>
              <p className="font-headings font-bold text-base text-ink mb-2">Derniers versements</p>
              <div className="rounded-lg border border-hairline overflow-hidden">
                {fiche.mises.slice(0, 8).map((m, i, liste) => (
                  <LigneTransaction
                    key={m.id}
                    nom={m.estCommission ? 'Commission' : 'Mise'}
                    meta={new Date(m.encaisseLe).toLocaleDateString('fr-FR', {
                      day: 'numeric',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                    montant={`+${formatMontant(m.montant)}`}
                    type={m.estCommission ? 'neutre' : 'positive'}
                    derniere={i === Math.min(liste.length, 8) - 1}
                  />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </Feuille>
  );
}

function sousTitre(fiche: Fiche): string {
  const morceaux = [fiche.marche, fiche.activite, fiche.telephone].filter(
    (x): x is string => Boolean(x),
  );
  return morceaux.length > 0 ? morceaux.join(' · ') : 'Aucune coordonnée renseignée';
}

/** Le numéro, et le consentement aux avis — les deux vont ensemble. */
function Coordonnees({
  fiche,
  onChange,
  onRelire,
}: {
  fiche: Fiche;
  onChange: () => void;
  onRelire: () => Promise<void>;
}) {
  const [envoi, setEnvoi] = useState(false);
  const [demande, setDemande] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function poser(accepte: boolean) {
    setEnvoi(true);
    setErreur(null);
    const resultat = await definirConsentementAvis(fiche.id, accepte);
    setEnvoi(false);
    setDemande(false);
    if (!resultat.ok) {
      setErreur(resultat.echec.message);
      return;
    }
    await onRelire();
    onChange();
  }

  if (!fiche.telephone) {
    return (
      <p className="font-body text-xs text-muted-foreground bg-canvas rounded-md p-3 m-0">
        Ce client n’a pas de numéro : aucun avis ne peut lui être envoyé.
      </p>
    );
  }

  if (demande) {
    return (
      <div className="bg-canvas rounded-md p-3">
        <p className="font-body text-sm text-ink m-0">
          {fiche.nom} accepte-t-il de recevoir un message à chaque mouvement sur son{' '}
          {fiche.telephone} ?
        </p>
        <p className="font-body text-xs text-muted-foreground mt-1">
          Demande-lui avant de confirmer.
        </p>
        <div className="flex gap-2 mt-2">
          <Bouton onClick={() => void poser(true)} disabled={envoi}>
            {envoi ? 'Enregistrement…' : 'Il a accepté'}
          </Bouton>
          <Bouton variante="contour" onClick={() => setDemande(false)} disabled={envoi}>
            Annuler
          </Bouton>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-canvas rounded-md p-3 flex items-center justify-between gap-3">
      <span className="flex items-center gap-2 min-w-0">
        <Icone
          nom={fiche.avisActifs ? 'bell' : 'bell-off'}
          taille={15}
          className={fiche.avisActifs ? 'text-positive shrink-0' : 'text-muted-foreground shrink-0'}
        />
        <span className="font-body text-xs text-muted-foreground truncate">
          {fiche.avisActifs ? 'Prévenu à chaque mouvement' : 'Non prévenu'}
        </span>
      </span>
      <button
        type="button"
        disabled={envoi}
        aria-pressed={fiche.avisActifs}
        onClick={() => (fiche.avisActifs ? void poser(false) : setDemande(true))}
        className="anim-pression px-3 py-1.5 rounded-pill border border-hairline text-ink text-xs font-body font-semibold whitespace-nowrap cursor-pointer disabled:opacity-40"
      >
        {fiche.avisActifs ? 'Ne plus prévenir' : 'Prévenir'}
      </button>
      {erreur && (
        <p role="alert" className="font-body text-xs text-negative m-0">
          {erreur}
        </p>
      )}
    </div>
  );
}

/**
 * L'ouverture d'une carte pour un client qui n'en a pas d'active.
 *
 * Le montant se compose : c'est le moment où le collecteur et le client
 * conviennent d'une somme, et elle n'est pas forcément l'un des cinq paliers.
 */
function NouvelleCarte({
  clientId,
  premiere,
  onOuverte,
}: {
  clientId: string;
  premiere: boolean;
  onOuverte: () => void;
}) {
  const [mise, setMise] = useState(1000);
  const [collecteurId, setCollecteurId] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    // `collecteur_id` accompagne l'écriture : la politique RLS l'exige au
    // `with check`. La coquille le connaît déjà, mais le passer à travers cinq
    // composants pour un usage unique coûte plus qu'une lecture de session.
    void supabase.auth.getUser().then(({ data }) => setCollecteurId(data.user?.id ?? null));
  }, []);

  async function ouvrir() {
    if (!collecteurId) return;
    setEnvoi(true);
    setErreur(null);
    const resultat = await ouvrirCarte(collecteurId, clientId, mise);
    setEnvoi(false);
    if (!resultat.ok) {
      setErreur(resultat.echec.message);
      return;
    }
    onOuverte();
  }

  return (
    <section className="border border-hairline rounded-lg p-4">
      <p className="font-headings font-bold text-base text-ink m-0">
        {premiere ? 'Ouvrir sa première carte' : 'Ouvrir une nouvelle carte'}
      </p>
      <p className="font-body text-sm text-muted-foreground mt-1 mb-3">
        {premiere
          ? 'Ce client est inscrit mais n’a pas encore de carte.'
          : 'Sa carte précédente est clôturée. Il peut reprendre, au même montant ou à un autre.'}
      </p>

      <ChoixMise mise={mise} onChoisir={setMise} identifiant={`carte-${clientId}`} />

      {erreur && (
        <p role="alert" className="font-body text-sm text-negative mt-3">
          {erreur}
        </p>
      )}

      <Bouton
        pleineLargeur
        icone="plus"
        className="mt-3"
        disabled={envoi || collecteurId === null}
        onClick={() => void ouvrir()}
      >
        {envoi ? 'Ouverture…' : 'Ouvrir la carte'}
      </Bouton>
    </section>
  );
}

/** Les cartes précédentes. Un client qui en a tenu quatre l'a mérité. */
function Historique({ cartes }: { cartes: Fiche['cartes'] }) {
  const passees = cartes.filter((k) => k.statut === 'cloturee');
  if (passees.length === 0) return null;

  return (
    <section>
      <p className="font-headings font-bold text-base text-ink mb-2">
        Cartes précédentes ({passees.length})
      </p>
      <div className="flex flex-col gap-2">
        {passees.map((k) => (
          <div
            key={k.id}
            className="flex items-center justify-between gap-3 bg-canvas rounded-md px-3 py-2"
          >
            <span className="min-w-0">
              <span className="block font-body text-sm text-ink tabular-nums">
                {formatMontant(k.mise)} FCFA · {k.misesEncaissees}/{MISES_PAR_CYCLE}
              </span>
              <span className="block font-body text-xs text-muted-foreground">
                {new Date(k.ouverteLe).toLocaleDateString('fr-FR', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                })}
                {k.clotureeLe &&
                  ` → ${new Date(k.clotureeLe).toLocaleDateString('fr-FR', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })}`}
              </span>
            </span>
            <span
              className={`px-2.5 py-1 rounded-pill text-xs font-body font-semibold whitespace-nowrap shrink-0 ${
                k.misesEncaissees >= MISES_PAR_CYCLE
                  ? 'bg-positive-tint text-positive'
                  : 'bg-muted text-muted-foreground'
              }`}
            >
              {k.misesEncaissees >= MISES_PAR_CYCLE ? 'Cycle tenu' : 'Rendue avant la fin'}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
