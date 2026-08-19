import {
  BarreHaute,
  Carte,
  CarteStat,
  CarteZone,
  EnteteSection,
  Icone,
  LienBloc,
  LigneCollecteur,
  type Statut,
} from '@kolek/ui';

/** Écran de démonstration — voir la note de TableauDeBord. */
const COLLECTEURS: Array<{
  nom: string;
  zone: string;
  clients: number;
  encaisse: string;
  statut: Statut;
}> = [
  { nom: 'Kouamé Assi', zone: 'Marché Adjamé', clients: 24, encaisse: '48 500', statut: 'À jour' },
  {
    nom: 'Aminata Coulibaly',
    zone: 'Marché Plateau',
    clients: 18,
    encaisse: '36 000',
    statut: 'À jour',
  },
  {
    nom: 'Sékou Traoré',
    zone: 'Marché Yopougon',
    clients: 31,
    encaisse: '12 400',
    statut: 'En retard',
  },
  { nom: 'Fatoumata Diallo', zone: 'Marché Abobo', clients: 15, encaisse: '0', statut: 'Inactif' },
  {
    nom: 'Moussa Koné',
    zone: 'Marché Cocody',
    clients: 22,
    encaisse: '44 000',
    statut: 'En synchro',
  },
];

const ZONES = [
  { zone: 'Adjamé', collecteurs: 6, clients: 142, encaisse: '284 000', progression: 72 },
  { zone: 'Plateau', collecteurs: 4, clients: 98, encaisse: '196 000', progression: 85 },
  { zone: 'Yopougon', collecteurs: 8, clients: 187, encaisse: '187 000', progression: 54 },
  { zone: 'Abobo', collecteurs: 5, clients: 110, encaisse: '88 000', progression: 38 },
];

/** Somme des colonnes fixes de `LigneCollecteur` plus la gouttière : en dessous,
    le nom du collecteur et le montant se chevauchent. Même idiome que
    `EncoursSoldes` et `Abonnements`. */
const LARGEUR_MINIMALE = 'min-w-[720px]';

function Filtre({ libelle }: { libelle: string }) {
  return (
    <div className="flex items-center gap-1 border border-hairline rounded-pill px-3 py-1.5 bg-surface">
      <span className="text-sm font-body text-ink font-medium">{libelle}</span>
      <Icone nom="chevron-down" taille={13} className="text-muted-foreground" />
    </div>
  );
}

export function Collecteurs({ onOuvrirCollecteur }: { onOuvrirCollecteur: () => void }) {
  return (
    <>
      <BarreHaute
        filAriane={['Accueil', 'Collecteurs']}
        titre="Collecteurs & Zones"
        actions={[
          { icone: 'search', libelle: 'Rechercher', disponible: false },
          { icone: 'sliders-horizontal', libelle: 'Filtrer', disponible: false },
          { icone: 'download', libelle: 'Exporter', disponible: false },
          { icone: 'plus', libelle: 'Ajouter un collecteur', principale: true, disponible: false },
        ]}
      />

      <div className="px-4 sm:px-6 lg:px-8 pb-8 flex flex-col gap-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <CarteStat libelle="Collecteurs actifs" valeur="18" tendance="+3" icone="users" />
          <CarteStat
            libelle="Encaissé aujourd’hui"
            valeur="548 900"
            unite="FCFA"
            tendance="+8 %"
            icone="trending-up"
          />
          <CarteStat libelle="Clients suivis" valeur="537" tendance="+14" icone="user-check" />
          <CarteStat
            libelle="En retard / inactifs"
            valeur="4"
            tendance="+1"
            tendancePositive={false}
            icone="alert-circle"
          />
        </div>

        <div>
          <EnteteSection titre="Zones & Marchés" action={<LienBloc libelle="Voir tout" />} />
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            {ZONES.map((z, i) => (
              <CarteZone key={z.zone} {...z} index={i} />
            ))}
          </div>
        </div>

        <Carte>
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 sm:px-6 py-4 border-b border-hairline">
            <h2 className="font-headings font-bold text-xl text-ink">Mes Collecteurs</h2>
            <div className="flex items-center gap-2">
              <Filtre libelle="Aujourd’hui" />
              <Filtre libelle="Toutes zones" />
            </div>
          </div>

          {/* `overflow-x-auto` et largeur minimale, comme dans EncoursSoldes :
              cinq colonnes à largeur fixe ne rentrent pas sur un téléphone, et
              les comprimer rendait les montants illisibles. On fait défiler le
              tableau plutôt que d'écraser les chiffres. */}
          <div className="overflow-x-auto">
            <div className={LARGEUR_MINIMALE}>
              {/* En-têtes de colonnes — mêmes largeurs que LigneCollecteur. */}
              <div className="flex items-center gap-4 px-4 sm:px-6 py-3 bg-canvas border-b border-hairline">
                <div className="w-10 flex-shrink-0" />
                <div className="flex-1 text-xs font-body font-semibold uppercase tracking-widest text-muted-foreground">
                  Collecteur
                </div>
                <div className="w-20 text-right text-xs font-body font-semibold uppercase tracking-widest text-muted-foreground">
                  Clients
                </div>
                <div className="w-36 text-right text-xs font-body font-semibold uppercase tracking-widest text-muted-foreground">
                  Encaissé
                </div>
                <div className="w-28 text-right text-xs font-body font-semibold uppercase tracking-widest text-muted-foreground">
                  Statut
                </div>
                <div className="w-10" />
              </div>

              {COLLECTEURS.map((c, i) => (
                <LigneCollecteur
                  key={c.nom}
                  {...c}
                  derniere={i === COLLECTEURS.length - 1}
                  onOuvrir={onOuvrirCollecteur}
                />
              ))}
            </div>
          </div>
        </Carte>
      </div>
    </>
  );
}
