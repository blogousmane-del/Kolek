import { formatMontant } from '@kolek/core';
import {
  ActionsRapides,
  Avatar,
  BandeauHorsLigne,
  Carte,
  CarteCollecte,
  EnteteSection,
  Icone,
  LienBloc,
  LigneTransaction,
  useEnLigne,
  type ActionRapide,
  type CleNavCollecteur,
} from '@kolek/ui';
import { useEffect, useState } from 'react';

import { chargerTableauCollecteur, type TableauCollecteur } from '../lectures';

/**
 * Écran d'accueil du collecteur.
 *
 * Il a porté les chiffres de la maquette — « 48 500 FCFA encaissés
 * aujourd'hui », « +8 % vs hier », « Mariam Koné, jour 18/31 » — au motif qu'un
 * écran de zéros serait « moins informatif qu'une maquette assumée ». L'argument
 * tenait tant que rien ne s'écrivait en base. Depuis que le collecteur encaisse
 * pour de vrai, un montant inventé sur cet écran est un montant qu'il peut
 * prendre pour sa recette du jour, et confronter à sa caisse le soir.
 *
 * Tout vient donc de la base, et ce qui n'est pas calculable a disparu : la
 * comparaison « vs hier » demanderait de retenir le total d'hier, que rien
 * n'enregistre. Les colonnes « Visités » et « Retards » aussi — la première
 * suppose une tournée planifiée, la seconde un rythme attendu, et ni l'une ni
 * l'autre n'existe dans le schéma.
 */
export function Accueil({
  nomCollecteur,
  revision,
  onNaviguer,
  onSouscrire,
  onDeconnexion,
}: {
  nomCollecteur: string | null;
  revision: number;
  onNaviguer: (cle: CleNavCollecteur) => void;
  onSouscrire: () => void;
  onDeconnexion: () => void;
}) {
  const enLigne = useEnLigne();
  const [tableau, setTableau] = useState<TableauCollecteur | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    let vivant = true;
    setErreur(null);

    // Le `try` n'est pas décoratif : le constructeur de requête de supabase-js
    // est un « thenable », pas une Promise. Sans cette enveloppe, une coupure
    // laisse l'écran figé sur des tirets.
    void (async () => {
      try {
        const t = await chargerTableauCollecteur();
        if (vivant) setTableau(t);
      } catch {
        if (vivant) setErreur('Chiffres indisponibles. Vérifie le réseau.');
      }
    })();

    return () => {
      vivant = false;
    };
  }, [revision]);

  // Deux actions mènent quelque part, les six autres sont désactivées avec leur
  // raison. `ActionsRapides` grise toute action sans `onActiver` — un bouton
  // éteint qui dit pourquoi est une information ; un bouton actif qui ne fait
  // rien est un défaut.
  const actions: ActionRapide[] = [
    { icone: 'circle-dollar-sign', libelle: 'Encaisser', onActiver: () => onNaviguer('clients') },
    { icone: 'user-plus', libelle: 'Souscrire', onActiver: onSouscrire },
    { icone: 'arrow-up-right', libelle: 'Retrait' },
    { icone: 'bar-chart-2', libelle: 'Bilan' },
    { icone: 'refresh-cw', libelle: 'Rapproch.' },
    { icone: 'receipt', libelle: 'Reçus' },
    { icone: 'bell', libelle: 'Alertes' },
    { icone: 'more-horizontal', libelle: 'Plus' },
  ];

  const nom = nomCollecteur ?? 'Collecteur';
  const chiffre = (valeur: number | undefined) =>
    tableau ? formatMontant(valeur ?? 0) : '—';

  return (
    <div className="flex-1 flex flex-col">
      {/* En-tête sombre */}
      <div className="bg-sidebar px-5 pt-12 pb-6">
        <div className="flex items-center justify-between mb-6">
          <div className="min-w-0">
            <p className="text-white/60 text-sm font-body">Bonjour,</p>
            <p className="text-white font-headings font-bold text-2xl truncate">{nom}</p>
          </div>
          <div className="flex items-center gap-3">
            {/* La maquette posait un portrait décoratif. Il devient la sortie de
                session : sans elle, un téléphone prêté reste connecté. */}
            <button
              type="button"
              onClick={onDeconnexion}
              aria-label="Se déconnecter"
              className="w-9 h-9 rounded-pill bg-white/10 flex items-center justify-center cursor-pointer"
            >
              <Icone nom="log-out" className="text-white" />
            </button>
            <Avatar nom={nom} className="w-10 h-10" />
          </div>
        </div>

        <div className="mb-2">
          <p className="text-white/60 text-sm font-body mb-1">Encaissé aujourd’hui</p>
          <p className="font-headings font-bold text-white text-4xl leading-[1.1] tabular-nums">
            {chiffre(tableau?.encaisseAujourdhui)}{' '}
            <span className="text-lg font-body font-medium text-white/60">FCFA</span>
          </p>
        </div>
        {/* Pas de « +8 % vs hier » : comparer à hier suppose de retenir le total
            d'hier, et rien ne l'enregistre. */}
        <p className="text-white/50 text-xs font-body">
          {tableau ? `${tableau.cartesActives} carte${tableau.cartesActives > 1 ? 's' : ''} active${tableau.cartesActives > 1 ? 's' : ''}` : ' '}
        </p>

        {!enLigne && <BandeauHorsLigne className="mt-4" />}
      </div>

      {/* Résumé du jour — trois nombres que la base sait vraiment donner. */}
      <div className="mx-4 -mt-4 bg-surface rounded-xl border border-hairline p-4 grid grid-cols-3 gap-3 shadow-md">
        <div className="text-center">
          <p className="text-xs text-muted-foreground font-body mb-0.5">Clients</p>
          <p className="font-headings font-bold text-xl text-ink tabular-nums">
            {tableau?.clients ?? '—'}
          </p>
        </div>
        <div className="text-center border-x border-hairline">
          <p className="text-xs text-muted-foreground font-body mb-0.5">Cartes actives</p>
          <p className="font-headings font-bold text-xl text-ink tabular-nums">
            {tableau?.cartesActives ?? '—'}
          </p>
        </div>
        <div className="text-center">
          <p className="text-xs text-muted-foreground font-body mb-0.5">Encours</p>
          <p className="font-headings font-bold text-xl text-ink tabular-nums">
            {chiffre(tableau?.encoursTotal)}
          </p>
        </div>
      </div>

      {erreur && (
        <p role="alert" className="mx-4 mt-3 text-sm font-body text-negative">
          {erreur}
        </p>
      )}

      <div className="mx-4 mt-5">
        <EnteteSection titre="Actions" />
        <ActionsRapides actions={actions} />
      </div>

      <div className="mx-4 mt-5">
        <EnteteSection
          titre="Carte du jour"
          className="mb-2"
          action={<LienBloc libelle="Toutes les cartes" onActiver={() => onNaviguer('clients')} />}
        />
        {tableau?.carteDuJour ? (
          <CarteCollecte
            nomClient={tableau.carteDuJour.nom}
            misePar={formatMontant(tableau.carteDuJour.mise)}
            jourCourant={tableau.carteDuJour.misesEncaissees}
            solde={formatMontant(tableau.carteDuJour.solde)}
            cycle="1"
          />
        ) : (
          <Carte className="p-4">
            <p className="text-base font-body text-ink m-0">
              {tableau ? 'Aucune carte active.' : 'Chargement…'}
            </p>
            {tableau && (
              <p className="text-sm font-body text-muted-foreground mt-1">
                Inscris un client pour ouvrir sa première carte.
              </p>
            )}
          </Carte>
        )}
      </div>

      <div className="mx-4 mt-5">
        <EnteteSection
          titre="Dernières mises"
          className="mb-2"
          action={<LienBloc libelle="Tout voir" onActiver={() => onNaviguer('clients')} />}
        />
        <Carte className="overflow-hidden">
          {!tableau ? (
            <p className="px-4 py-5 text-base font-body text-muted-foreground m-0">Chargement…</p>
          ) : tableau.dernieres.length === 0 ? (
            <p className="px-4 py-5 text-base font-body text-muted-foreground m-0">
              Aucune mise encaissée pour l’instant.
            </p>
          ) : (
            tableau.dernieres.map((ligne, i) => (
              <LigneTransaction
                key={`${ligne.quand}-${i}`}
                nom={ligne.nom}
                meta={`${new Date(ligne.quand).toLocaleDateString('fr-FR', {
                  day: 'numeric',
                  month: 'short',
                })} · ${ligne.estCommission ? 'Commission' : 'Mise'}`}
                montant={`+${formatMontant(ligne.montant)}`}
                type={ligne.estCommission ? 'neutre' : 'positive'}
                derniere={i === tableau.dernieres.length - 1}
              />
            ))
          )}
        </Carte>
      </div>

      <div className="flex-1 min-h-6" />
    </div>
  );
}
