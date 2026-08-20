import { BarreHaute, Carte, Icone } from '@kolek/ui';

/**
 * Encaisser une mise — depuis l'administration.
 *
 * Cet écran ne sera pas branché, et il faut dire pourquoi plutôt que de laisser
 * croire qu'il attend son tour.
 *
 * **La règle métier s'y oppose.** Le cahier des charges §11 pose que l'argent
 * est manié par le collecteur, pas par la plateforme. Un encaissement saisi
 * depuis un bureau GTCS serait une mise sans espèces en face : le rapprochement
 * de caisse du collecteur, qui compare `cash_declare` à `cash_attendu`, en
 * sortirait faussé sans que personne comprenne pourquoi.
 *
 * **La base s'y oppose aussi**, et c'est cohérent. La politique RLS d'insertion
 * sur `mises` exige `collecteur_id = auth.uid()`, et le déclencheur
 * `mises_avant_insert` réécrit de toute façon `collecteur_id` depuis la carte.
 * Un administrateur n'est pas le collecteur : sa session ne peut pas produire
 * cette écriture. Le forcer demanderait une Edge Function à clé de service,
 * c'est-à-dire contourner délibérément une règle que le schéma défend.
 *
 * ---
 *
 * L'écran portait jusqu'ici une maquette complète : un client nommé, un cycle,
 * un solde, des montants sélectionnables et un bouton de confirmation éteint.
 * Rien de tout cela n'existait en base. C'est le même défaut que l'accueil du
 * collecteur — des chiffres inventés sur un écran qu'un exploitant lit — et il
 * est plus grave ici, puisque l'écran prétend manipuler de l'argent.
 *
 * Reste ce qui est vrai : l'action n'est pas disponible, et voici pourquoi.
 */
export function EncaisserMise() {
  return (
    <>
      <BarreHaute
        filAriane={['Accueil', 'Encaisser']}
        titre="Encaisser une mise"
        actions={[]}
      />

      <div className="px-4 sm:px-6 lg:px-8 pb-8">
        <Carte className="p-6 max-w-2xl">
          <div className="flex items-start gap-3 mb-4">
            <Icone nom="alert-circle" taille={20} className="text-muted-foreground mt-0.5" />
            <h2 className="font-headings font-bold text-xl text-ink">
              L’encaissement ne se fait pas depuis l’administration
            </h2>
          </div>

          <p className="font-body text-base text-ink mb-4">
            Une mise correspond à des espèces remises de la main à la main. Elle est enregistrée
            par le collecteur, sur son téléphone, au moment où il les reçoit.
          </p>

          <p className="font-body text-sm text-muted-foreground mb-4">
            Ce n’est pas une limitation technique en attente d’être levée, mais la règle qui rend
            les comptes justes. Le rapprochement de caisse compare chaque soir ce qu’un collecteur
            déclare avoir en main à ce que ses mises supposent. Une mise saisie depuis un bureau
            n’aurait pas d’espèces en face, et l’écart apparaîtrait sur le collecteur sans que
            personne puisse l’expliquer.
          </p>

          <div className="border-t border-hairline pt-4">
            <p className="font-body text-sm font-semibold text-ink mb-2">
              Ce que l’administration peut faire
            </p>
            <ul className="font-body text-sm text-muted-foreground space-y-1.5">
              <li>
                Suivre les encaissements en temps réel — <strong>Tableau de bord</strong> et{' '}
                <strong>Encours &amp; Soldes</strong>.
              </li>
              <li>
                Vérifier l’activité d’un collecteur et ses cartes en cours —{' '}
                <strong>Collecteurs</strong>.
              </li>
              <li>
                Créer un compte collecteur et gérer son abonnement —{' '}
                <strong>Collecteurs</strong> puis <strong>Abonnements</strong>.
              </li>
            </ul>
          </div>
        </Carte>
      </div>
    </>
  );
}
