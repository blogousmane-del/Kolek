/**
 * La maquette portait trois tables de statuts recopiées dans trois écrans, dont
 * une en hexadécimaux bruts. Trois copies, c'est trois occasions qu'« En
 * retard » soit rouge ici et gris là. Une seule table ici.
 */
const STATUTS = {
  'À jour': 'bg-positive-tint text-positive',
  Actif: 'bg-positive-tint text-positive',
  'En retard': 'bg-negative-tint text-negative',
  Inactif: 'bg-muted text-muted-foreground',
  'En synchro': 'bg-info-tint text-info',
  'Versé aujourd’hui': 'bg-secondary text-secondary-foreground',
  Clôturée: 'bg-secondary text-secondary-foreground',
  // Le mot est déjà pris : `Retrait.tsx` et `FicheClient.tsx` disent tous deux
  // « Cycle terminé » pour une carte à 31/31 encore ouverte. Une carte pleine
  // reste positive — c'est un objectif atteint, pas un abandon — donc la même
  // teinte que « À jour », et jamais un second mot pour le même état.
  'Cycle terminé': 'bg-positive-tint text-positive',
} as const;

export type Statut = keyof typeof STATUTS;

interface Props {
  statut: Statut;
  /** Le rembourrage change selon la densité de l'écran ; la couleur, jamais. */
  className?: string;
}

export function BadgeStatut({ statut, className = 'px-2.5 py-1' }: Props) {
  return (
    <span
      className={`rounded-pill text-xs font-body font-semibold whitespace-nowrap ${STATUTS[statut]} ${className}`}
    >
      {statut}
    </span>
  );
}
