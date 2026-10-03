/**
 * Le tampon : la marque d'un geste qui ne se défait pas.
 *
 * Au guichet, une somme encaissée reçoit un coup de tampon. Ici aussi, et
 * c'est ce qui remplace le bandeau vert à coche qu'avait l'encaissement : le
 * succès se lit **sur la carte**, à l'endroit du geste, et non dans un
 * message qui pourrait parler de n'importe quoi.
 *
 * Trois mots, trois moments. ENCAISSÉ : la mise est partie au serveur.
 * GARDÉE : elle attend dans la file du téléphone, en bleu « information »,
 * parce que rien n'a échoué. CLÔTURÉE : le retrait est inscrit. Une mise
 * refusée ne reçoit **aucun** tampon : c'est l'écran qui décide de ne pas en
 * poser, et ce composant ne connaît pas l'échec.
 *
 * `aria-hidden` : le tampon répète ce que la ligne d'état dit déjà en
 * `role="status"`. L'annoncer deux fois, c'est faire attendre deux fois.
 *
 * La rotation vit sur l'enveloppe, l'animation sur le corps. Ce n'est pas que
 * l'une écraserait l'autre : Tailwind v4 écrit `-rotate-6` dans la propriété
 * `rotate`, qu'une animation de `transform` n'écrase pas, et les deux se
 * composeraient sur un seul élément. Le découpage garde l'angle hors de portée
 * de l'animation, quoi que Tailwind compile un jour pour la rotation.
 */
export type MotTampon = 'Encaissé' | 'Gardée' | 'Clôturée';

const TONS: Record<MotTampon, string> = {
  Encaissé: 'text-positive border-positive',
  Gardée: 'text-info border-info',
  Clôturée: 'text-positive border-positive',
};

/** `02.10 · 11:47`, à l'heure du téléphone : c'est celle du geste. */
export function horodatageTampon(quand: Date): string {
  const deux = (n: number) => String(n).padStart(2, '0');
  return `${deux(quand.getDate())}.${deux(quand.getMonth() + 1)} · ${deux(quand.getHours())}:${deux(quand.getMinutes())}`;
}

export function Tampon({
  mot,
  quand,
  className = '',
}: {
  mot: MotTampon;
  quand: Date;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      data-tampon={mot}
      className={`pointer-events-none inline-block -rotate-6 ${className}`}
    >
      {/* Le cadre double : une bordure de 2 px, un blanc de 2 px, un filet de
          1 px. C'est ce qui fait lire un tampon et non un badge. */}
      <span
        className={`anim-tampon flex flex-col items-center rounded-md border-2 bg-surface/90 px-2.5 pb-1 pt-1.5 shadow-[inset_0_0_0_2px_var(--color-surface),inset_0_0_0_3px_currentColor] ${TONS[mot]}`}
      >
        <span className="font-headings text-base font-extrabold uppercase leading-tight tracking-widest">
          {mot}
        </span>
        <span className="font-mono text-xs leading-tight">{horodatageTampon(quand)}</span>
      </span>
    </span>
  );
}
