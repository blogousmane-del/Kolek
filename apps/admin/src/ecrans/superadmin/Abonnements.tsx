import { PALIERS, formatMontant } from '@kolek/core';
import { Avatar, BadgeStatut, Bouton, Carte, Icone, Pagination, usePagination } from '@kolek/ui';
import { useEffect, useRef, useState } from 'react';

import { modifierCollecteur, type LigneCollecteur, type VueGlobale } from '../../donnees';
import type { ActionSuperAdmin, EtatSuperAdmin } from '../../superadmin';
import { FicheModifiable } from '../FicheModifiable';
import { dateLisible, mrrLisible } from './lisible';

type FiltreStatut = 'tous' | 'actif' | 'expirant' | 'suspendu';

const FILTRES: { cle: FiltreStatut; libelle: string }[] = [
  { cle: 'tous', libelle: 'Tous' },
  { cle: 'actif', libelle: 'Actif' },
  { cle: 'expirant', libelle: 'Expirant' },
  { cle: 'suspendu', libelle: 'Suspendu' },
];

const COLONNES_ABONNES = '1fr 100px 110px 120px 120px 110px 60px';
const LARGEUR_MINIMALE_ABONNES = 'min-w-[860px]';

function PastillePalier({ palier }: { palier: string }) {
  const description = PALIERS.find((p) => p.cle === palier);
  if (!description) {
    return (
      <span className="px-2.5 py-1 rounded-pill text-xs font-body font-semibold bg-negative-tint text-negative whitespace-nowrap">
        {palier} ?
      </span>
    );
  }
  return (
    <span
      className="px-2.5 py-1 rounded-pill text-xs font-body font-semibold w-fit whitespace-nowrap"
      style={{ background: description.fond, color: description.texte }}
    >
      {description.nom}
    </span>
  );
}

function PastilleStatut({ c }: { c: LigneCollecteur }) {
  if (c.abonnement_statut === 'actif') {
    const joursRestants = Math.ceil(
      (new Date(c.abonnement_echeance).getTime() - Date.now()) / 86_400_000,
    );
    if (joursRestants <= 7) {
      return (
        <span className="px-2.5 py-1 rounded-pill text-xs font-body font-semibold bg-negative-tint text-negative whitespace-nowrap">
          Expire dans {Math.max(joursRestants, 0)} j
        </span>
      );
    }
    return <BadgeStatut statut="Actif" />;
  }
  return (
    <span className="px-2.5 py-1 rounded-pill text-xs font-body font-semibold bg-negative-tint text-negative whitespace-nowrap">
      {c.abonnement_statut === 'suspendu' ? 'Suspendu' : 'Expiré'}
    </span>
  );
}

export function OngletAbonnements({
  vue,
  etat,
  occupe,
  onRecharger,
  onVerdict,
  onAppliquer,
}: {
  vue: VueGlobale;
  etat: EtatSuperAdmin;
  occupe: boolean;
  onRecharger: () => void;
  /** Un seul emplacement de message pour tout l'écran, tenu par le parent :
      deux verdicts simultanés laisseraient croire à deux opérations. */
  onVerdict: (ok: boolean, message: string) => void;
  onAppliquer: (demande: Extract<ActionSuperAdmin, { action: 'appliquer_code' }>) => void;
}) {
  const { abonnements, collecteurs } = vue;
  const prixParPalier = new Map(abonnements.parPalier.map((p) => [p.palier, p.prix]));
  const [filtre, setFiltre] = useState<FiltreStatut>('tous');
  const [recherche, setRecherche] = useState('');
  /** Le collecteur dont la fiche est ouverte en correction, et celui pour qui
      on choisit un code promo. Deux panneaux, jamais les deux à la fois : ils
      parlent du même abonnement et se contrediraient à l'écran. */
  const [edition, setEdition] = useState<string | null>(null);
  const [promo, setPromo] = useState<string | null>(null);
  /** L'identifiant de la ligne dont une bascule est en vol. Il désactive les
      commandes de cette ligne-là seulement : suspendre un collecteur n'a pas
      à figer le tableau entier. */
  const [enVol, setEnVol] = useState<string | null>(null);
  const [codeChoisi, setCodeChoisi] = useState('');

  const enEdition = edition ? (collecteurs.find((c) => c.id === edition) ?? null) : null;
  const enPromo = promo ? (collecteurs.find((c) => c.id === promo) ?? null) : null;
  const codesApplicables = etat.codes_promo.filter((c) => c.statut === 'en_cours');

  /**
   * Suspendre ou réactiver un abonnement.
   *
   * Passe par `admin-modifier-collecteur`, pas par `super-admin-action` : c'est
   * le même geste que celui de la fiche collecteur du Dashboard, avec les mêmes
   * règles côté serveur. Lui ouvrir une seconde route donnerait deux façons de
   * suspendre, et un jour deux comportements.
   *
   * L'échéance n'est pas touchée. Repousser une date revient à offrir du
   * service, et cela relève de la facturation — la même raison qu'en
   * `FicheModifiable`.
   */
  async function basculerAbonnement(c: LigneCollecteur) {
    if (enVol) return;
    const suspendre = c.abonnement_statut !== 'suspendu';
    setEnVol(c.id);
    const resultat = await modifierCollecteur(c.id, {
      abonnementStatut: suspendre ? 'suspendu' : 'actif',
    });
    setEnVol(null);

    if (!resultat.ok) {
      onVerdict(false, resultat.message);
      return;
    }
    onVerdict(
      true,
      suspendre ? `Abonnement de ${c.nom} suspendu.` : `Abonnement de ${c.nom} réactivé.`,
    );
    onRecharger();
  }

  /**
   * Le tableau filtré — délibérément **pas** mémoïsé.
   *
   * ## Ce que le point F de l'auto-audit proposait, et pourquoi ça ne se fait
   * pas ici
   *
   * L'audit du 2026-09-09 relevait que ce tableau, neuf à chaque rendu, empêche
   * le `useMemo` de `usePagination` de jamais servir son cache. C'est exact, et
   * `Collecteurs.tsx` a été mémoïsé pour cette raison le 2026-09-10.
   *
   * Celui-ci ne peut pas suivre. Ses deux branches `actif` et `expirant`
   * calculent les jours restants depuis `Date.now()`, et `PastilleStatut` refait
   * **le même calcul** à chaque rendu pour écrire « Expire dans N j ». Mémoïser
   * le filtre le figerait au dernier changement de dépendance pendant que la
   * pastille resterait vivante : au passage d'une frontière de jour, la même
   * ligne serait classée « Actif » par le filtre et annoncée « Expire dans 7 j »
   * par sa pastille. Un écran qui se contredit lui-même, sur la console qui sert
   * à facturer.
   *
   * Le coût de ne pas mémoïser est nul à l'échelle réelle : quelques centaines
   * de lignes reparcourues quand on ouvre le menu d'une ligne. Le coût de
   * mémoïser serait une incohérence visible. Deux tests gardent l'accord entre
   * le filtre et la pastille — voir `SuperAdmin.test.tsx`.
   *
   * Le jour où ce tableau deviendrait assez long pour que ça pèse, la sortie
   * n'est pas le `useMemo` : c'est de donner une seule horloge aux deux calculs.
   */
  const collecteursFiltres = collecteurs.filter((c) => {
    // Recherche textuelle — déclenchée à partir de 3 caractères.
    if (recherche.length >= 3) {
      const q = recherche.toLowerCase();
      if (!c.nom.toLowerCase().includes(q) && !c.telephone.toLowerCase().includes(q)) {
        return false;
      }
    }

    switch (filtre) {
      case 'actif': {
        if (c.abonnement_statut !== 'actif') return false;
        const jours = Math.ceil(
          (new Date(c.abonnement_echeance).getTime() - Date.now()) / 86_400_000,
        );
        return jours > 7;
      }
      case 'expirant': {
        if (c.abonnement_statut !== 'actif') return false;
        const jours = Math.ceil(
          (new Date(c.abonnement_echeance).getTime() - Date.now()) / 86_400_000,
        );
        return jours <= 7;
      }
      case 'suspendu':
        return c.abonnement_statut === 'suspendu' || c.abonnement_statut === 'expire';
      default:
        return true;
    }
  });

  /**
   * La page affichée du tableau des abonnés.
   *
   * ## On filtre, puis on découpe
   *
   * L'inverse donnerait un écran qui a l'air de marcher et qui ment : la
   * recherche ne porterait plus que sur les cinquante lignes affichées, et GTCS
   * conclurait qu'un abonné qui existe n'est pas inscrit. Sur un écran qui sert
   * à suspendre et à réactiver des abonnements payants, c'est la mauvaise
   * conclusion à laisser prendre.
   *
   * ## Pourquoi ce n'est pas la pagination du Journal
   *
   * Le Journal de sécurité, plus bas, demande une page à la fois au serveur —
   * ses lignes sont trop nombreuses pour tenir en mémoire. Ce tableau-ci lit
   * `vue.collecteurs`, déjà chargée en une fois pour tout l'écran : lui
   * redemander des pages ajouterait un aller-retour par clic sur des données
   * qu'on a déjà. Même taille de page pour les deux, cela dit.
   */
  const { page, pages, total, visibles, allerA } = usePagination(collecteursFiltres);

  /**
   * Toute nouvelle question se pose depuis le début du tableau.
   *
   * Sans ce retour, on cherche depuis la page 2 et l'écran répond par le
   * cinquante-et-unième résultat : les cinquante premiers existent, et sont
   * invisibles. Le repli du crochet — ramener la page dans les bornes — ne
   * suffit pas, puisqu'une recherche large laisse assez de pages pour que la
   * deuxième reste valide.
   */
  const changerFiltre = (f: FiltreStatut) => {
    setFiltre(f);
    allerA(1);
  };

  const changerRecherche = (terme: string) => {
    setRecherche(terme);
    allerA(1);
  };

  const indicateurs = [
    {
      libelle: 'MRR total',
      valeur: formatMontant(abonnements.mrr),
      unite: 'FCFA',
      precision: `${abonnements.collecteurs_actifs} abonnement${abonnements.collecteurs_actifs > 1 ? 's' : ''} actif${abonnements.collecteurs_actifs > 1 ? 's' : ''}`,
      alerte: false,
    },
    {
      libelle: 'Collecteurs actifs',
      valeur: String(abonnements.collecteurs_actifs),
      unite: '',
      precision: `sur ${abonnements.collecteurs_total} inscrits`,
      alerte: false,
    },
    {
      libelle: 'Expirations ce mois',
      valeur: String(abonnements.expirations_ce_mois),
      unite: '',
      precision: abonnements.expirations_ce_mois > 0 ? 'À traiter' : 'Aucune expiration',
      alerte: abonnements.expirations_ce_mois > 0,
    },
    {
      libelle: 'En défaut',
      valeur: String(abonnements.suspendus + abonnements.expires),
      unite: '',
      precision: `${abonnements.suspendus} suspendu${abonnements.suspendus > 1 ? 's' : ''}, ${abonnements.expires} expiré${abonnements.expires > 1 ? 's' : ''}`,
      alerte: abonnements.suspendus + abonnements.expires > 0,
    },
  ];

  return (
    <>
      {/* Les deux panneaux d'action, au-dessus du tableau et non en surcouche :
          une boîte modale demande un piège de focus, une touche Échap et un
          retour au bouton d'origine, et rien de tout cela n'existe encore dans
          ce produit. Une modale à moitié faite se referme au clavier sur du
          vide — un panneau posé dans le flux, non. */}
      {enEdition && (
        <section aria-label={`Modifier ${enEdition.nom}`}>
          <FicheModifiable
            collecteur={enEdition}
            onEnregistre={() => {
              setEdition(null);
              onVerdict(true, `Fiche de ${enEdition.nom} enregistrée.`);
              onRecharger();
            }}
            onAnnuler={() => setEdition(null)}
          />
        </section>
      )}

      {enPromo && (
        <Carte className="p-5">
          <h3 className="font-headings font-bold text-lg text-ink mb-1">
            Appliquer un code promo
          </h3>
          <p className="font-body text-sm text-muted-foreground mb-4">
            {enPromo.nom} — palier {PALIERS.find((pa) => pa.cle === enPromo.palier)?.nom ?? enPromo.palier}.
            La remise court jusqu'à la date de fin du code.
          </p>

          {codesApplicables.length === 0 ? (
            <p className="font-body text-sm text-muted-foreground mb-4">
              Aucun code en cours. Crée-le dans l'écran Promotions : un code programmé ou expiré ne
              s'applique pas.
            </p>
          ) : (
            <label className="flex flex-col gap-1.5 mb-4 max-w-xs">
              <span className="text-sm font-body font-medium text-ink">Code</span>
              <select
                value={codeChoisi}
                onChange={(e) => setCodeChoisi(e.target.value)}
                className="h-11 px-3 rounded-md border border-input bg-surface font-body text-champ text-ink cursor-pointer"
              >
                <option value="">Choisir un code…</option>
                {codesApplicables.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code} — −{c.remise_pct} % jusqu'au {dateLisible(c.valide_au)}
                  </option>
                ))}
              </select>
            </label>
          )}

          <div className="flex flex-wrap gap-2">
            <Bouton
              disabled={occupe || !codeChoisi}
              onClick={() => {
                onAppliquer({ action: 'appliquer_code', collecteur: enPromo.id, code: codeChoisi });
                setPromo(null);
                setCodeChoisi('');
              }}
            >
              Appliquer
            </Bouton>
            <Bouton
              variante="fantome"
              onClick={() => {
                setPromo(null);
                setCodeChoisi('');
              }}
            >
              Annuler
            </Bouton>
          </div>
        </Carte>
      )}

      {/* Indicateurs clés */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {indicateurs.map((ind) => (
          <Carte key={ind.libelle} className="p-5">
            <span className="text-sm font-body font-medium text-muted-foreground block mb-1">
              {ind.libelle}
            </span>
            <p
              className={`font-headings font-bold text-2xl sm:text-3xl tabular-nums ${
                ind.alerte ? 'text-negative' : 'text-ink'
              }`}
            >
              {ind.valeur}
              {ind.unite && (
                <span className="text-lg font-body font-medium text-muted-foreground ml-1">
                  {ind.unite}
                </span>
              )}
            </p>
            <span
              className={`text-sm font-body mt-2 block ${
                ind.alerte ? 'text-negative font-medium' : 'text-muted-foreground'
              }`}
            >
              {ind.precision}
            </span>
          </Carte>
        ))}
      </div>

      {/* Paliers d'abonnement */}
      <div>
        <h2 className="font-headings font-bold text-xl text-ink mb-3">Paliers d'abonnement</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {PALIERS.map((palier) => {
            const compte = abonnements.parPalier.find((p) => p.palier === palier.cle);
            return (
              <Carte key={palier.cle} className="overflow-hidden flex flex-col">
                <div className="h-1.5 w-full" style={{ background: palier.teinte }} />
                <div className="p-5 flex flex-col flex-1">
                  <div className="flex items-baseline justify-between gap-2 mb-3">
                    <span className="font-headings font-bold text-lg text-ink">{palier.nom}</span>
                    <span className="text-2xl font-headings font-bold text-ink tabular-nums text-right">
                      {palier.prix === 0 ? (
                        <span className="text-muted-foreground text-lg">Gratuit</span>
                      ) : (
                        <>
                          {formatMontant(palier.prix)}{' '}
                          <span className="text-xs font-body font-medium text-muted-foreground">
                            FCFA/mois
                          </span>
                        </>
                      )}
                    </span>
                  </div>
                  <p className="text-sm font-body text-muted-foreground mb-3">{palier.limite}</p>

                  {palier.fonctions
                    .filter((f) => f.incluse)
                    .map((fonction) => (
                      <div key={fonction.libelle} className="flex items-center gap-2 mb-1.5">
                        <Icone nom="check" taille={13} className="text-positive flex-shrink-0" />
                        <span className="text-sm font-body text-ink">{fonction.libelle}</span>
                      </div>
                    ))}

                  <div className="mt-auto pt-3 border-t border-hairline flex items-center justify-between">
                    <span className="text-sm font-body text-muted-foreground">
                      {compte?.actifs ?? 0} actif{(compte?.actifs ?? 0) > 1 ? 's' : ''}
                    </span>
                    <span className="text-sm font-body font-semibold text-ink tabular-nums">
                      {mrrLisible(compte?.mrr ?? 0)}
                    </span>
                  </div>
                </div>
              </Carte>
            );
          })}
        </div>
      </div>

      {/* Tableau des collecteurs abonnés */}
      <Carte className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 sm:px-6 py-4 border-b border-hairline">
          <h2 className="font-headings font-bold text-xl text-ink">Collecteurs abonnés</h2>
          <div className="flex flex-wrap items-center gap-3">
            {/* Filtres */}
            <div className="flex items-center gap-1">
              {FILTRES.map((f) => (
                <button
                  key={f.cle}
                  type="button"
                  // Lequel des quatre porte le tableau ne se disait que par la
                  // couleur — `bg-primary` contre `text-muted-foreground`. Au
                  // lecteur d'écran, les quatre boutons étaient identiques, et
                  // rien n'indiquait sur quel sous-ensemble d'abonnés on
                  // regardait. `aria-pressed` le dit sans rien changer à l'œil.
                  aria-pressed={filtre === f.cle}
                  onClick={() => changerFiltre(f.cle)}
                  className={`px-3 py-1.5 rounded-md text-sm font-body font-medium cursor-pointer transition-colors ${
                    filtre === f.cle
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-secondary'
                  }`}
                >
                  {f.libelle}
                </button>
              ))}
            </div>
            {/* Recherche */}
            <div className="relative">
              <Icone
                nom="search"
                taille={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
              />
              <input
                type="text"
                placeholder="Rechercher…"
                value={recherche}
                onChange={(e) => changerRecherche(e.target.value)}
                className="pl-9 pr-3 h-9 bg-surface border border-hairline rounded-md font-body text-champ text-ink outline-none focus:border-primary w-44"
              />
            </div>
          </div>
        </div>

        {collecteursFiltres.length === 0 ? (
          <p className="px-4 sm:px-6 py-8 text-sm font-body text-muted-foreground">
            {recherche.length >= 3
              ? 'Aucun collecteur ne correspond à cette recherche.'
              : 'Aucun collecteur dans ce filtre.'}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <div className={LARGEUR_MINIMALE_ABONNES}>
              <div
                className="grid px-4 sm:px-6 py-3 bg-canvas border-b border-hairline text-xs font-body font-semibold uppercase tracking-widest text-muted-foreground gap-4"
                style={{ gridTemplateColumns: COLONNES_ABONNES }}
              >
                <span>Collecteur</span>
                <span>Palier</span>
                <span>Depuis</span>
                <span className="text-right">Expiration</span>
                <span className="text-right">MRR</span>
                <span className="text-right">Statut</span>
                <span />
              </div>

              {visibles.map((c, i) => (
                <div
                  key={c.id}
                  data-testid={`abonne-${c.id}`}
                  className={`grid items-center px-4 sm:px-6 py-3.5 gap-4 ${
                    i < visibles.length - 1 ? 'border-b border-hairline' : ''
                  }`}
                  style={{ gridTemplateColumns: COLONNES_ABONNES }}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Avatar nom={c.nom} className="w-8 h-8 flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="text-base font-body font-semibold text-ink truncate">
                        {c.nom}
                      </p>
                      <p className="text-xs font-body text-muted-foreground truncate">
                        {c.telephone}
                      </p>
                    </div>
                  </div>
                  <PastillePalier palier={c.palier} />
                  <span className="text-sm font-body text-muted-foreground tabular-nums">
                    {dateLisible(c.cree_le)}
                  </span>
                  <span className="text-right text-sm font-body text-muted-foreground tabular-nums">
                    {dateLisible(c.abonnement_echeance)}
                  </span>
                  <span className="text-right text-sm font-body font-semibold text-ink tabular-nums">
                    {mrrLisible(
                      c.abonnement_statut === 'actif' ? (prixParPalier.get(c.palier) ?? 0) : 0,
                    )}
                  </span>
                  <div className="flex justify-end">
                    <PastilleStatut c={c} />
                  </div>
                  <div className="flex justify-end gap-1">
                    <button
                      type="button"
                      disabled={enVol === c.id}
                      aria-label={`Modifier ${c.nom}`}
                      title="Modifier"
                      onClick={() => {
                        setPromo(null);
                        setEdition(c.id);
                      }}
                      className={`w-8 h-8 flex items-center justify-center rounded-md text-muted-foreground ${
                        enVol === c.id ? 'opacity-50 cursor-default' : 'cursor-pointer'
                      }`}
                    >
                      <Icone nom="edit" taille={14} />
                    </button>
                    <MenuLigne
                      c={c}
                      occupe={enVol === c.id}
                      onPromo={() => {
                        setEdition(null);
                        setCodeChoisi('');
                        setPromo(c.id);
                      }}
                      onBasculer={() => void basculerAbonnement(c)}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Hors du conteneur qui défile latéralement : les commandes restent en
            place même quand le tableau est poussé vers la droite. `total`
            compte tout ce que le filtre laisse passer, et non la page. */}
        <Pagination page={page} pages={pages} total={total} onAller={allerA} />
      </Carte>
    </>
  );
}

/**
 * Le menu « … » d'une ligne du tableau des abonnés.
 *
 * Deux entrées seulement, et toutes deux mènent quelque part : appliquer un
 * code promo, suspendre ou réactiver l'abonnement. C'est la contrepartie de ce
 * que ce dépôt a retiré trois fois — une commande qui ne fait rien coûte plus
 * cher que son absence. Ces deux boutons-là étaient `disabled` depuis la
 * maquette ; ils font maintenant ce que leur infobulle promet.
 *
 * La modification de la fiche n'est pas dans le menu : elle a le crayon à côté,
 * et la ranger ici la cacherait derrière un clic de plus pour le geste le plus
 * courant.
 */
function MenuLigne({
  c,
  occupe,
  onPromo,
  onBasculer,
}: {
  c: LigneCollecteur;
  occupe: boolean;
  onPromo: () => void;
  onBasculer: () => void;
}) {
  const [ouvert, setOuvert] = useState(false);
  const boite = useRef<HTMLDivElement>(null);
  const suspendu = c.abonnement_statut === 'suspendu';

  // Échap et clic à côté referment, comme le sélecteur d'espace de la barre
  // latérale. Un menu de ligne qui reste ouvert pendant qu'on lit une autre
  // ligne recouvre celle qu'on lit.
  useEffect(() => {
    if (!ouvert) return;
    const surTouche = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOuvert(false);
    };
    const surClic = (e: MouseEvent) => {
      if (!boite.current?.contains(e.target as Node)) setOuvert(false);
    };
    window.addEventListener('keydown', surTouche);
    document.addEventListener('mousedown', surClic);
    return () => {
      window.removeEventListener('keydown', surTouche);
      document.removeEventListener('mousedown', surClic);
    };
  }, [ouvert]);

  return (
    <div className="relative" ref={boite}>
      <button
        type="button"
        disabled={occupe}
        aria-haspopup="menu"
        aria-expanded={ouvert}
        aria-label={`Plus d'options pour ${c.nom}`}
        title="Plus d'options"
        onClick={() => setOuvert((o) => !o)}
        className={`w-8 h-8 flex items-center justify-center rounded-md text-muted-foreground ${
          occupe ? 'opacity-50 cursor-default' : 'cursor-pointer'
        }`}
      >
        <Icone nom="more-horizontal" taille={14} />
      </button>

      {ouvert && (
        <div
          role="menu"
          className="absolute right-0 top-9 z-20 w-56 rounded-md bg-surface border border-hairline shadow-lg overflow-hidden py-1"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOuvert(false);
              onPromo();
            }}
            className="w-full text-left flex items-center gap-2.5 px-3 py-2.5 font-body text-sm text-ink cursor-pointer"
          >
            <Icone nom="coins" taille={15} className="text-primary flex-shrink-0" />
            Appliquer un code promo
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOuvert(false);
              onBasculer();
            }}
            className="w-full text-left flex items-center gap-2.5 px-3 py-2.5 font-body text-sm text-ink cursor-pointer"
          >
            <Icone
              nom={suspendu ? 'check-circle' : 'bell-off'}
              taille={15}
              className={`flex-shrink-0 ${suspendu ? 'text-positive' : 'text-negative'}`}
            />
            {suspendu ? "Réactiver l'abonnement" : "Suspendre l'abonnement"}
          </button>
        </div>
      )}
    </div>
  );
}
