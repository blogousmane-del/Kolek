export interface Segment<C extends string> {
  cle: C;
  libelle: string;
  compte?: number;
}

/**
 * Des choix exclusifs, rangés dans une piste : les filtres d'une liste.
 *
 * Ils remplacent le rang de puces qu'avait le retrait. Une puce à fond vert
 * plein se lit comme un bouton d'action ; trois segments dans une piste se
 * lisent comme une seule commande à trois positions, ce qu'ils sont.
 *
 * **Le compte est `aria-hidden`.** Le nom d'un segment reste son libellé seul,
 * que les phrases d'annonce de l'écran reprennent (« masquée par le filtre
 * « En cours » ») : un nom qui changerait avec le compte ferait mentir ces
 * phrases, et les épreuves qui cherchent le segment par son nom.
 *
 * Le segment choisi porte un filet `trait` en plus du fond blanc : un fond
 * blanc sur la piste ne tient qu'environ 1,1:1, et l'état choisi doit se
 * voir à 3:1 (WCAG 1.4.11).
 */
export function Segments<C extends string>({
  nom,
  segments,
  choisi,
  onChoisir,
}: {
  nom: string;
  segments: Segment<C>[];
  choisi: C;
  onChoisir: (cle: C) => void;
}) {
  return (
    // Des colonnes égales tant que la place le permet, jamais plus étroites que leur texte :
    // à 320 px, « Cycle terminé 12 » sortait de sa pastille. Au-delà, la piste défile en elle-même plutôt que de pousser la page.
    <div
      role="group"
      aria-label={nom}
      className="grid grid-flow-col auto-cols-[minmax(max-content,1fr)] gap-1 rounded-lg bg-muted p-1 overflow-x-auto"
    >
      {segments.map((segment) => {
        const actif = segment.cle === choisi;
        return (
          <button
            key={segment.cle}
            type="button"
            aria-pressed={actif}
            onClick={() => onChoisir(segment.cle)}
            className={`anim-pression flex min-h-11 items-center justify-center gap-1.5 whitespace-nowrap rounded-md border px-2 font-body text-sm font-semibold cursor-pointer ${
              actif
                ? 'border-trait bg-surface text-ink shadow-sm'
                : 'border-transparent text-muted-foreground'
            }`}
          >
            {segment.libelle}
            {segment.compte !== undefined && (
              <span aria-hidden="true" className="font-mono text-xs font-medium">
                {segment.compte}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
