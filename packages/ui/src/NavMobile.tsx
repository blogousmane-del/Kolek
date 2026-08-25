import { Icone, type NomIcone } from './Icone';

export type CleNavCollecteur = 'accueil' | 'clients' | 'encaisser' | 'bilans' | 'profil';

interface Onglet {
  cle: CleNavCollecteur;
  icone: NomIcone;
  libelle: string;
  disponible: boolean;
  /** L'encaissement est le geste du métier : il sort de la barre. */
  saillant?: boolean;
}

const ONGLETS: Onglet[] = [
  { cle: 'accueil', icone: 'home', libelle: 'Accueil', disponible: true },
  { cle: 'clients', icone: 'users', libelle: 'Clients', disponible: true },
  {
    cle: 'encaisser',
    icone: 'circle-dollar-sign',
    libelle: 'Encaisser',
    disponible: true,
    saillant: true,
  },
  // Les deux derniers ont été éteints tant qu'aucun écran ne vivait derrière.
  // Ils sont branchés depuis le 2026-08-20 : `bilans` mène au bilan, `profil` à
  // la fiche du collecteur — le même écran que la pastille « Plus » de l'accueil,
  // deux chemins vers un seul endroit plutôt que deux endroits qui se ressemblent.
  { cle: 'bilans', icone: 'bar-chart-2', libelle: 'Bilans', disponible: true },
  { cle: 'profil', icone: 'user', libelle: 'Profil', disponible: true },
];

interface Props {
  actif: CleNavCollecteur;
  onNaviguer: (cle: CleNavCollecteur) => void;
  /** Posé sur la barre elle-même, jamais sur une boîte autour.
      Voir le commentaire de rendu ci-dessous : c'est un correctif de panne, pas
      une commodité de style. */
  className?: string;
}

export function NavMobile({ actif, onNaviguer, className = '' }: Props) {
  return (
    // `fixed` et non `sticky`, depuis le 2026-08-25.
    //
    // `sticky bottom-0` ne colle que tant que la boîte englobante déborde du
    // champ de vision. Sur un écran court — l'accueil d'un collecteur qui a
    // trois clients — la barre n'a pas de course : elle se pose là où le
    // contenu s'arrête, au milieu de l'écran, puis remonte avec le document dès
    // qu'on fait défiler. C'est ce qu'on voyait, et ce n'est pas ce qu'une
    // application mobile fait.
    //
    // `fixed` la sort du flux : elle est posée sur le champ de vision, elle ne
    // bouge plus, quelle que soit la longueur de la page. Le prix est que le
    // document ne réserve plus sa place — d'où `pb-nav` sur la colonne, sans
    // quoi la dernière ligne d'une liste passe dessous.
    //
    // La largeur ne s'hérite plus non plus. `left-1/2 -translate-x-1/2` avec
    // `max-w-mobile` reproduit le centrage de la colonne : entre 640 et 1023 px
    // celle-ci est plafonnée à 520 px, et une barre pleine fenêtre sous un
    // contenu de 520 px se lit comme deux mises en page superposées.
    //
    // `pb-barre` ajoute le repos de la barre de geste iOS sous les onglets.
    // Sans elle, en mode installé, le trait du bas recouvre les libellés et
    // mange le tiers inférieur de la zone cliquable des cinq onglets.
    //
    // `className` entre ici plutôt que sur un `<div>` enveloppant, et cette
    // règle survit au changement de positionnement : une enveloppe autour d'un
    // élément `fixed` ne le casse pas, mais elle réintroduit une boîte dont le
    // `overflow` ou le `transform` peut le rogner ou le recadrer. La propriété
    // existe pour qu'il n'y ait rien entre la barre et son parent.
    //
    // `<nav>` plutôt que `<div>` : cinq onglets qui mènent aux cinq écrans du
    // métier sont un repère de navigation. C'est aussi ce qui rend la barre
    // nommable — donc vérifiable, ce que `Coquille.test.tsx` fait.
    <nav
      aria-label="Navigation principale"
      className={`fixed bottom-0 left-1/2 -translate-x-1/2 z-30 w-full max-w-mobile bg-surface border-t border-hairline flex items-center justify-around px-2 pt-3 pb-barre ${className}`}
    >
      {ONGLETS.map((onglet) => {
        const estActif = onglet.cle === actif;

        if (onglet.saillant) {
          return (
            <button
              key={onglet.cle}
              type="button"
              onClick={() => onNaviguer(onglet.cle)}
              className="anim-pression flex flex-col items-center gap-1 -mt-5 px-2 cursor-pointer"
            >
              <div className="w-14 h-14 rounded-pill bg-primary flex items-center justify-center shadow-action">
                <Icone nom={onglet.icone} taille={24} className="text-primary-foreground" />
              </div>
              <span className="text-xs font-body font-semibold text-primary">{onglet.libelle}</span>
            </button>
          );
        }

        const teinte = !onglet.disponible
          ? 'text-muted-foreground/40'
          : estActif
            ? 'text-primary'
            : 'text-muted-foreground';

        return (
          <button
            key={onglet.cle}
            type="button"
            disabled={!onglet.disponible}
            onClick={() => onNaviguer(onglet.cle)}
            // `min-w-14 py-1.5` : icône 22 px plus libellé 11 px donnaient une
            // cible de 37 px de haut, sous le minimum tactile de 44 px. Sur un
            // téléphone tenu d'une main, dans un marché, on rate l'onglet.
            className={`anim-pression flex flex-col items-center gap-1 px-2 py-1.5 min-w-14 ${
              onglet.disponible ? 'cursor-pointer' : 'cursor-default'
            }`}
          >
            <Icone nom={onglet.icone} taille={22} className={teinte} />
            <span className={`text-xs font-body font-medium ${teinte}`}>{onglet.libelle}</span>
          </button>
        );
      })}
    </nav>
  );
}
