import { Icone, type NomIcone } from './Icone';

export interface ActionCarte {
  icone: NomIcone;
  libelle: string;
  /** Absent : le bouton reste affiché, désactivé. Voir la note ci-dessous. */
  onActiver?: () => void;
  /** Ce que dit le `title` quand l'action ne s'applique pas. */
  indisponible?: string;
  /**
   * Le nom lu à voix haute, quand le libellé visible ne suffit pas à désigner.
   *
   * Un écran peut porter deux commandes qui s'appellent « Encaisser » — celle
   * de la grille de raccourcis, qui ouvre la liste des clients, et celle-ci,
   * qui encaisse la carte affichée. À l'œil, la position tranche ; à l'oreille,
   * rien ne les distingue. « Encaisser sur la carte de Mariam » la nomme.
   */
  description?: string;
}

interface Props {
  actions: ActionCarte[];
}

/**
 * La rangée de commandes qui se pose sous une carte.
 *
 * ## Pourquoi elle est séparée de `CarteCollecte`
 *
 * Parce que la carte se dessine aussi là où aucune commande n'a de sens —
 * l'écran d'encaissement en montre une pendant la saisie, et une rangée de
 * boutons y serait une invitation à quitter le geste en cours. Une carte qui
 * porterait ses propres actions obligerait cet écran à les désactiver une par
 * une ; séparées, il ne les demande simplement pas.
 *
 * C'est aussi ce qui permet à la rangée de rester **fixe** sous un carrousel :
 * attachée à la carte, elle défilerait avec elle et sortirait de l'écran au
 * moment où le doigt la cherche.
 *
 * ## Une action indisponible reste affichée
 *
 * Elle est désactivée, jamais retirée. Une rangée qui perd un bouton fait
 * glisser les autres sous le doigt déjà en route — et le doigt appuie sur ce
 * qui a pris la place. Même convention que `ActionsRapides` : `disabled`,
 * opacité réduite, et un `title` qui dit pourquoi.
 *
 * Deux à quatre actions. Au-delà, la grille de `ActionsRapides` est le bon
 * outil : à cinq pastilles en rangée, les libellés se coupent.
 */
export function ActionsCarte({ actions }: Props) {
  return (
    <div className="flex items-start justify-around gap-2 bg-surface rounded-xl border border-hairline p-3">
      {actions.map((action) => (
        <button
          key={action.libelle}
          type="button"
          disabled={!action.onActiver}
          aria-label={action.description}
          title={action.onActiver ? undefined : action.indisponible}
          onClick={action.onActiver}
          className={`anim-pression flex flex-col items-center gap-1.5 min-w-16 ${
            action.onActiver ? 'cursor-pointer' : 'opacity-50 cursor-default'
          }`}
        >
          {/* `border-primary` pleine, comme sur `ActionsRapides` : c'est le trait
              qui fait lire la pastille comme une commande. Le fond teinté ne
              suffit pas — `secondary` sur `surface` ne rend qu'environ 1,1:1. */}
          <span className="w-12 h-12 rounded-pill bg-secondary text-primary border border-primary flex items-center justify-center">
            <Icone nom={action.icone} taille={20} />
          </span>
          <span className="text-xs font-body font-semibold text-ink text-center leading-tight">
            {action.libelle}
          </span>
        </button>
      ))}
    </div>
  );
}
