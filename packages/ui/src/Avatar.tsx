/**
 * Remplace les portraits engendrés de la maquette. Un produit qui manipule
 * l'épargne de commerçants n'affiche pas des visages inventés à la place de ses
 * clients : la maquette illustrait, l'application identifie. On dessine donc
 * les initiales, ce qui a l'avantage d'être vrai, de ne rien télécharger et de
 * ne dépendre d'aucune source externe — la CSP interdit les images distantes.
 */

const FONDS = ['bg-chart-mint', 'bg-chart-blue', 'bg-chart-teal', 'bg-chart-slate'] as const;

export function initiales(nom: string): string {
  const mots = nom.trim().split(/[\s-]+/).filter(Boolean);
  if (mots.length === 0) return '?';
  const premier = mots[0] ?? '';
  const dernier = mots.length > 1 ? (mots[mots.length - 1] ?? '') : '';
  return (premier.slice(0, 1) + dernier.slice(0, 1)).toUpperCase();
}

/**
 * Même nom, même couleur, toujours — sur tous les écrans et entre deux
 * sessions. Un collecteur reconnaît ses clients à la pastille avant de lire le
 * texte ; une couleur tirée au hasard à chaque rendu détruirait ce repère.
 */
export function fondPour(nom: string): (typeof FONDS)[number] {
  let somme = 0;
  for (const caractere of nom) somme = (somme + caractere.codePointAt(0)!) % 9973;
  return FONDS[somme % FONDS.length]!;
}

interface Props {
  nom: string;
  /** Taille par les utilitaires, comme dans la maquette : `w-10 h-10`. */
  className?: string;
}

export function Avatar({ nom, className = 'w-10 h-10' }: Props) {
  return (
    <span
      className={`@container inline-flex items-center justify-center rounded-pill ${fondPour(nom)} ${className}`}
      title={nom}
    >
      {/* Unité `cqw` : le texte suit la taille du disque, quelle que soit la
          classe passée par l'écran. Un `text-sm` figé serait illisible en
          w-8 et perdu en w-16. */}
      <span className="font-headings font-bold text-[38cqw] leading-none text-sidebar">
        {initiales(nom)}
      </span>
    </span>
  );
}
