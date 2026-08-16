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

/**
 * Écran de démonstration : les chiffres viennent de la maquette, pas de la
 * base. Le tableau de bord du collecteur agrège des mises, des retraits et une
 * caisse du jour — trois choses que J2a introduit. Le brancher sur des données
 * vides aujourd'hui donnerait un écran de zéros, moins informatif qu'une
 * maquette assumée.
 */
const DERNIERES = [
  { nom: 'Mariam Koné', meta: 'Aujourd’hui · Mise', montant: '+1 000', type: 'positive' as const },
  {
    nom: 'Jean-Luc Bamba',
    meta: 'Aujourd’hui · Mise',
    montant: '+500',
    type: 'positive' as const,
  },
  { nom: 'Adja Touré', meta: 'Hier · Restitution', montant: '-31 000', type: 'negative' as const },
];

export function Accueil({
  onNaviguer,
  onDeconnexion,
}: {
  onNaviguer: (cle: CleNavCollecteur) => void;
  onDeconnexion: () => void;
}) {
  const enLigne = useEnLigne();

  const actions: ActionRapide[] = [
    { icone: 'circle-dollar-sign', libelle: 'Encaisser', onActiver: () => onNaviguer('encaisser') },
    { icone: 'user-plus', libelle: 'Souscrire' },
    { icone: 'arrow-up-right', libelle: 'Retrait' },
    { icone: 'bar-chart-2', libelle: 'Bilan' },
    { icone: 'refresh-cw', libelle: 'Rapproch.' },
    { icone: 'receipt', libelle: 'Reçus' },
    { icone: 'bell', libelle: 'Alertes' },
    { icone: 'more-horizontal', libelle: 'Plus' },
  ];

  return (
    <div className="flex-1 flex flex-col">
      {/* En-tête sombre */}
      <div className="bg-sidebar px-5 pt-12 pb-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <p className="text-white/60 text-sm font-body">Bonjour,</p>
            <p className="text-white font-headings font-bold text-2xl">Kouamé Assi</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              aria-label="Alertes"
              className="w-9 h-9 rounded-pill bg-white/10 flex items-center justify-center relative cursor-pointer"
            >
              <Icone nom="bell" className="text-white" />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-pill bg-negative" />
            </button>
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
            <Avatar nom="Kouamé Assi" className="w-10 h-10" />
          </div>
        </div>

        <div className="mb-2">
          <p className="text-white/60 text-sm font-body mb-1">Encaissé aujourd’hui</p>
          <p className="font-headings font-bold text-white text-4xl leading-[1.1] tabular-nums">
            48 500 <span className="text-lg font-body font-medium text-white/60">FCFA</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1 px-2.5 py-1 rounded-pill bg-positive-tint text-positive text-xs font-body font-semibold">
            <Icone nom="arrow-up-right" taille={11} />
            +8 %
          </span>
          <span className="text-white/50 text-xs font-body">vs hier</span>
        </div>

        {!enLigne && <BandeauHorsLigne className="mt-4" />}
      </div>

      {/* Résumé du jour */}
      <div className="mx-4 -mt-4 bg-surface rounded-xl border border-hairline p-4 grid grid-cols-3 gap-3 shadow-md">
        <div className="text-center">
          <p className="text-xs text-muted-foreground font-body mb-0.5">Clients</p>
          <p className="font-headings font-bold text-xl text-ink tabular-nums">24</p>
        </div>
        <div className="text-center border-x border-hairline">
          <p className="text-xs text-muted-foreground font-body mb-0.5">Visités</p>
          <p className="font-headings font-bold text-xl text-ink tabular-nums">14</p>
        </div>
        <div className="text-center">
          <p className="text-xs text-muted-foreground font-body mb-0.5">Retards</p>
          <p className="font-headings font-bold text-xl text-negative tabular-nums">2</p>
        </div>
      </div>

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
        <CarteCollecte
          nomClient="Mariam Koné"
          misePar="1 000"
          jourCourant={18}
          solde="18 000"
          cycle="3"
        />
      </div>

      <div className="mx-4 mt-5">
        <EnteteSection titre="Dernières mises" className="mb-2" action={<LienBloc libelle="Tout voir" />} />
        <Carte className="overflow-hidden">
          {DERNIERES.map((ligne, i) => (
            <LigneTransaction key={ligne.nom} {...ligne} derniere={i === DERNIERES.length - 1} />
          ))}
        </Carte>
      </div>

      <div className="flex-1 min-h-6" />
    </div>
  );
}
