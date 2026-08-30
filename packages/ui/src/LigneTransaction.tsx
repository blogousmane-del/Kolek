import { Avatar } from './Avatar';

export type TypeMontant = 'positive' | 'negative' | 'neutre';

interface Props {
  nom: string;
  meta: string;
  montant: string;
  type?: TypeMontant;
  derniere?: boolean;
}

const COULEURS: Record<TypeMontant, string> = {
  positive: 'text-positive',
  negative: 'text-negative',
  neutre: 'text-ink',
};

export function LigneTransaction({ nom, meta, montant, type = 'positive', derniere = false }: Props) {
  return (
    <div
      className={`flex items-center gap-3 px-5 py-3.5 ${derniere ? '' : 'border-b border-hairline'}`}
    >
      <Avatar nom={nom} className="w-9 h-9 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-base font-body font-semibold text-ink truncate">{nom}</p>
        {/* Tronqué comme le nom au-dessus : « 30 août · Commission » passait sur
            deux lignes dans le volet de droite, et la ligne suivante remontait
            contre elle. */}
        <p className="text-sm font-body text-muted-foreground truncate">{meta}</p>
      </div>
      {/* Le montant ne se coupe pas et ne se comprime pas : c'est la colonne que
          l'œil suit de haut en bas. */}
      <p
        className={`text-base font-body font-bold tabular-nums whitespace-nowrap flex-shrink-0 ${COULEURS[type]}`}
      >
        {montant} FCFA
      </p>
    </div>
  );
}
