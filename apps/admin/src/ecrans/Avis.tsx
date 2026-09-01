import { PALIERS, formatMontant } from '@kolek/core';
import { BarreHaute, Bouton, Carte, Icone } from '@kolek/ui';
import { useCallback, useEffect, useState } from 'react';

import {
  PRIX_SEGMENT,
  chargerAvis,
  definirPolitique,
  estimationMensuelle,
  type Canal,
  type EtatAvis,
  type LigneAvis,
  type Politique,
} from '../avis';

/**
 * Les avis envoyés aux clients épargnants.
 *
 * C'est l'écran qui allume le seul dispositif du produit rendant un
 * encaissement contestable par celui qui l'a payé — et la seule commande dont
 * un clic se traduit en facture opérateur. Les deux tiennent ensemble : la
 * valeur du dispositif est exactement ce qui le rend cher.
 *
 * ## Pourquoi le coût est affiché avant le bouton
 *
 * Un collecteur au palier Pro (150 clients) verse environ 3 900 mises par mois.
 * À 20 FCFA le segment, l'avis par mise coûte 78 000 FCFA pour un abonnement de
 * 5 000 — seize fois. Cacher ce rapport derrière un interrupteur « Notifier les
 * clients » ferait de la case la plus coûteuse la case la plus naturelle à
 * cocher. Elle est donc chiffrée, à côté de l'abonnement qu'elle dépasse.
 *
 * ## Ce que l'écran ne peut pas faire
 *
 * Donner le consentement à la place des clients. La colonne `clients_consentants`
 * est là pour ça : ouvrir un canal sur un portefeuille où personne n'a accepté
 * n'enverra rien, et il vaut mieux le lire ici que le déduire d'un silence.
 */

/**
 * WhatsApp a été retiré de cette liste le 2026-08-30.
 *
 * Il y figurait avec la note « Moins cher, mais suppose que le client a WhatsApp
 * et le relève ». La note était fausse et la case était un piège : aucune
 * passerelle WhatsApp n'existe, et `envoyer-avis` ne filtre pas par canal — le
 * choisir faisait partir un SMS, facturé 20 FCFA le segment, sous une étiquette
 * promettant une économie.
 *
 * Le cahier des charges désigne pourtant WhatsApp comme le canal prioritaire.
 * L'administrateur qui suivait la spécification tombait donc exactement dessus.
 *
 * La base refuse désormais ce canal — `CANAL_SANS_PASSERELLE`. Le retirer d'ici
 * évite de proposer un choix que le serveur rejettera : un formulaire qui offre
 * ce qu'il refuse ensuite est une façon lente de dire non.
 */
const CANAUX: { cle: Canal; libelle: string; note: string }[] = [
  { cle: 'aucun', libelle: 'Aucun', note: 'Rien ne part. État par défaut.' },
  { cle: 'sms', libelle: 'SMS', note: 'Environ 20 FCFA par message.' },
];

function prixAbonnement(cle: string): number | null {
  return PALIERS.find((p) => p.cle === cle)?.prix ?? null;
}

export function Avis() {
  const [etat, setEtat] = useState<EtatAvis | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [ouvert, setOuvert] = useState<string | null>(null);

  const relire = useCallback(async () => {
    try {
      setEtat(await chargerAvis());
      setErreur(null);
    } catch (cause) {
      setErreur(cause instanceof Error ? cause.message : 'Lecture impossible.');
    }
  }, []);

  useEffect(() => {
    void relire();
  }, [relire]);

  const actifs = etat?.collecteurs.filter((c) => c.canal !== 'aucun').length ?? 0;
  const enAttente = etat?.collecteurs.reduce((s, c) => s + c.en_attente, 0) ?? 0;

  return (
    <>
      <BarreHaute
        filAriane={['Système', etat === null ? 'Avis clients' : `Avis clients · ${actifs} actifs`]}
        titre="Avis aux clients"
        actions={[{ libelle: 'Actualiser', icone: 'history', onActiver: () => void relire() }]}
      />

      <div className="p-4 sm:p-6 flex flex-col gap-4">
        {erreur && (
          <p role="alert" className="bg-negative-tint text-negative text-sm font-body p-3 rounded-md">
            {erreur}
          </p>
        )}

        {/* Le rappel qui doit rester sous les yeux : le dispositif protège
            l'épargnant, et il coûte plus que l'abonnement qui le finance. */}
        <Carte className="p-5">
          <div className="flex items-start gap-3">
            <Icone nom="bell" taille={18} className="text-primary shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="font-headings font-bold text-base text-ink mb-1">
                Un avis à chaque mouvement
              </p>
              <p className="font-body text-sm text-muted-foreground">
                Le client reçoit le montant versé, son rang dans le cycle et la somme à lui rendre.
                C’est sa seule trace écrite : Kolek ne voit pas passer l’argent, il ne peut que le
                dire. Chaque message se paie environ {PRIX_SEGMENT} FCFA — l’avis par mise dépasse
                largement l’abonnement, d’où le quota.
              </p>
              {etat?.derniere_erreur && (
                <p className="font-body text-sm text-negative mt-2">
                  Dernier refus de la passerelle : {etat.derniere_erreur.raison} (
                  {new Date(etat.derniere_erreur.quand).toLocaleDateString('fr-FR')})
                </p>
              )}
              {enAttente > 0 && (
                <p className="font-body text-sm text-ink mt-2">
                  {enAttente} avis en attente d’envoi. Sans passerelle configurée, la file reste
                  intacte — rien n’est perdu, rien n’est parti.
                </p>
              )}
            </div>
          </div>
        </Carte>

        {etat === null && !erreur && (
          <p className="font-body text-sm text-muted-foreground py-8 text-center">Lecture…</p>
        )}

        {etat?.collecteurs.length === 0 && (
          <Carte className="p-8 text-center">
            <p className="font-headings font-bold text-lg text-ink mb-1">Aucun collecteur</p>
            <p className="font-body text-sm text-muted-foreground">
              Les avis se règlent collecteur par collecteur.
            </p>
          </Carte>
        )}

        {etat?.collecteurs.map((ligne) => (
          <LigneCollecteur
            key={ligne.id}
            ligne={ligne}
            ouvert={ouvert === ligne.id}
            onBasculer={() => setOuvert(ouvert === ligne.id ? null : ligne.id)}
            onEnregistre={() => {
              setOuvert(null);
              void relire();
            }}
          />
        ))}
      </div>
    </>
  );
}

function LigneCollecteur({
  ligne,
  ouvert,
  onBasculer,
  onEnregistre,
}: {
  ligne: LigneAvis;
  ouvert: boolean;
  onBasculer: () => void;
  onEnregistre: () => void;
}) {
  const actif = ligne.canal !== 'aucun';
  const reste = Math.max(ligne.quota_mensuel - ligne.segments_consommes, 0);

  return (
    <Carte className={`p-5 ${actif ? 'border-primary' : ''}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="font-headings font-bold text-lg text-ink truncate">{ligne.nom}</p>
          <p className="font-body text-sm text-muted-foreground">
            {ligne.clients_consentants} client{ligne.clients_consentants > 1 ? 's' : ''} sur{' '}
            {ligne.clients} {ligne.clients_consentants > 1 ? 'ont accepté' : 'a accepté'} d’être
            prévenu{ligne.clients_consentants > 1 ? 's' : ''}
          </p>
        </div>
        <span
          className={`px-2.5 py-1 rounded-pill text-xs font-body font-semibold whitespace-nowrap shrink-0 ${
            actif ? 'bg-positive-tint text-positive' : 'bg-muted text-muted-foreground'
          }`}
        >
          {actif ? ligne.canal.toUpperCase() : 'Éteint'}
        </span>
      </div>

      {actif && (
        <div className="grid gap-3 sm:grid-cols-3 mt-4">
          <Chiffre
            terme="Quota du mois"
            valeur={`${ligne.segments_consommes} / ${ligne.quota_mensuel}`}
            note={reste === 0 ? 'Épuisé' : `${reste} segments restants`}
            alerte={reste === 0}
          />
          <Chiffre
            terme="Partis ce mois"
            valeur={String(ligne.envoyes_mois)}
            note={`≈ ${formatMontant(ligne.envoyes_mois * PRIX_SEGMENT)} FCFA`}
          />
          <Chiffre
            terme="Non partis"
            valeur={String(ligne.bloques + ligne.abandonnes)}
            note={`${ligne.bloques} hors quota · ${ligne.abandonnes} abandonnés`}
            alerte={ligne.abandonnes > 0}
          />
        </div>
      )}

      {ouvert ? (
        <Editeur ligne={ligne} onAnnuler={onBasculer} onEnregistre={onEnregistre} />
      ) : (
        <Bouton variante="contour" className="mt-4" onClick={onBasculer}>
          {ligne.regle ? 'Modifier la politique' : 'Définir la politique'}
        </Bouton>
      )}
    </Carte>
  );
}

function Chiffre({
  terme,
  valeur,
  note,
  alerte = false,
}: {
  terme: string;
  valeur: string;
  note: string;
  alerte?: boolean;
}) {
  return (
    <div className="bg-canvas rounded-md p-3">
      <p className="font-body text-xs text-muted-foreground">{terme}</p>
      <p className="font-headings font-bold text-lg text-ink tabular-nums">{valeur}</p>
      <p className={`font-body text-xs ${alerte ? 'text-negative' : 'text-muted-foreground'}`}>
        {note}
      </p>
    </div>
  );
}

function Editeur({
  ligne,
  onAnnuler,
  onEnregistre,
}: {
  ligne: LigneAvis;
  onAnnuler: () => void;
  onEnregistre: () => void;
}) {
  const [politique, setPolitique] = useState<Politique>({
    canal: ligne.canal,
    sur_mise: ligne.sur_mise,
    sur_retrait: ligne.sur_retrait,
    sur_ouverture: ligne.sur_ouverture,
    quota_mensuel: ligne.quota_mensuel,
  });
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const projection = estimationMensuelle({ ...ligne, ...politique });
  const abonnement = prixAbonnement(ligne.palier);
  const quotaValide = Number.isInteger(politique.quota_mensuel) && politique.quota_mensuel >= 0;

  async function enregistrer() {
    if (!quotaValide) return;
    setEnvoi(true);
    setErreur(null);
    const resultat = await definirPolitique(ligne.id, politique);
    setEnvoi(false);
    if (!resultat.ok) {
      setErreur(resultat.message);
      return;
    }
    onEnregistre();
  }

  return (
    <div className="mt-4 pt-4 border-t border-hairline">
      <p className="font-body text-sm font-semibold text-ink mb-2">Canal</p>
      <div className="flex flex-wrap gap-2 mb-4">
        {CANAUX.map((c) => (
          <button
            key={c.cle}
            type="button"
            onClick={() => setPolitique({ ...politique, canal: c.cle })}
            title={c.note}
            className={`px-3 py-2 rounded-md text-sm font-body font-semibold border cursor-pointer ${
              politique.canal === c.cle
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-surface text-ink border-hairline'
            }`}
          >
            {c.libelle}
          </button>
        ))}
      </div>

      <p className="font-body text-sm font-semibold text-ink mb-2">Ce qui déclenche un avis</p>
      <div className="flex flex-col gap-2 mb-4">
        <Case
          coche={politique.sur_ouverture}
          onBasculer={(v) => setPolitique({ ...politique, sur_ouverture: v })}
          titre="Ouverture d’une carte"
          note="Une fois par carte. Le message le moins cher, et celui qui annonce au client que le dispositif existe."
        />
        <Case
          coche={politique.sur_retrait}
          onBasculer={(v) => setPolitique({ ...politique, sur_retrait: v })}
          titre="Clôture et restitution"
          note="Une fois par cycle. C’est le moment où l’argent sort : le message qui compte le plus."
        />
        <Case
          coche={politique.sur_mise}
          onBasculer={(v) => setPolitique({ ...politique, sur_mise: v })}
          titre="Chaque versement"
          note="Environ 26 messages par client et par mois. C’est cette case qui fait la facture."
          cher
        />
      </div>

      <label
        htmlFor={`quota-${ligne.id}`}
        className="block font-body text-sm font-semibold text-ink mb-1"
      >
        Quota mensuel, en segments
      </label>
      <input
        id={`quota-${ligne.id}`}
        type="number"
        min={0}
        max={50000}
        step={100}
        value={politique.quota_mensuel}
        onChange={(e) =>
          setPolitique({ ...politique, quota_mensuel: Math.trunc(Number(e.target.value)) })
        }
        className="w-40 bg-surface border border-hairline rounded-md px-3 py-2.5 font-body text-base text-ink tabular-nums outline-none focus:border-primary"
      />
      <p className="font-body text-xs text-muted-foreground mt-1 mb-4">
        Au-delà, les avis sont composés et marqués « hors quota » plutôt qu’envoyés. Plafond{' '}
        {formatMontant(politique.quota_mensuel * PRIX_SEGMENT)} FCFA.
      </p>

      {/* La comparaison qui décide. Elle est calculée sur les clients qui ont
          consenti, pas sur le portefeuille entier : c'est le nombre qui sera
          réellement facturé. */}
      <div
        className={`rounded-md p-3 mb-4 ${
          abonnement !== null && projection > abonnement ? 'bg-negative-tint' : 'bg-canvas'
        }`}
      >
        <p className="font-body text-sm text-ink">
          Au rythme actuel : <strong className="tabular-nums">{formatMontant(projection)} FCFA</strong>{' '}
          de messages par mois
          {abonnement !== null && abonnement > 0 && (
            <>
              , pour un abonnement de{' '}
              <strong className="tabular-nums">{formatMontant(abonnement)} FCFA</strong>
              {projection > abonnement && (
                <> — soit {Math.round(projection / abonnement)} fois son prix.</>
              )}
            </>
          )}
        </p>
        {ligne.clients_consentants === 0 && (
          <p className="font-body text-xs text-muted-foreground mt-1">
            Aucun client n’a encore accepté d’être prévenu : rien ne partira, quel que soit le
            réglage. Le consentement se recueille depuis l’application du collecteur.
          </p>
        )}
      </div>

      {erreur && (
        <p role="alert" className="font-body text-sm text-negative mb-3">
          {erreur}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <Bouton onClick={() => void enregistrer()} disabled={envoi || !quotaValide}>
          {envoi ? 'Enregistrement…' : 'Enregistrer'}
        </Bouton>
        <Bouton variante="contour" onClick={onAnnuler} disabled={envoi}>
          Annuler
        </Bouton>
      </div>
    </div>
  );
}

function Case({
  coche,
  onBasculer,
  titre,
  note,
  cher = false,
}: {
  coche: boolean;
  onBasculer: (valeur: boolean) => void;
  titre: string;
  note: string;
  cher?: boolean;
}) {
  return (
    <label className="flex items-start gap-3 bg-canvas rounded-md p-3 cursor-pointer">
      <input
        type="checkbox"
        checked={coche}
        onChange={(e) => onBasculer(e.target.checked)}
        className="mt-1 w-4 h-4 shrink-0 accent-[var(--color-primary)]"
      />
      <span className="min-w-0">
        <span className="block font-body text-sm font-semibold text-ink">
          {titre}
          {cher && (
            <span className="ml-2 px-2 py-0.5 rounded-pill bg-negative-tint text-negative text-xs">
              coûteux
            </span>
          )}
        </span>
        <span className="block font-body text-xs text-muted-foreground">{note}</span>
      </span>
    </label>
  );
}
