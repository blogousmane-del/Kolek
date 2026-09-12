import { Bouton, Carte, CarteStat } from '@kolek/ui';

import type { AdministrateurSuper, EtatSuperAdmin } from '../../superadmin';
import { dateLisible } from './lisible';

export function Administrateurs({
  etat,
  occupe,
  onDefinir,
  onRevoquer,
}: {
  etat: EtatSuperAdmin;
  occupe: boolean;
  onDefinir: (cible: string, niveau: AdministrateurSuper['niveau']) => void;
  onRevoquer: (cible: string) => void;
}) {
  /** Un identifiant n'est un nom pour personne : « ajouté par » se relit dans
      la liste elle-même quand l'auteur y figure encore. */
  const nomDe = new Map(etat.administrateurs.map((a) => [a.user_id, a.nom]));

  return (
    <section>
      <h2 className="font-headings font-bold text-xl text-ink mb-1">Administrateurs</h2>
      <p className="font-body text-sm text-muted-foreground mb-3">
        Un super administrateur voit et modifie cet écran. Un administrateur ordinaire ne le voit
        pas.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
        <CarteStat
          libelle="Comptes d’administration"
          valeur={String(etat.administrateurs.length)}
          precision="voient le Dashboard"
          icone="users"
        />
        <CarteStat
          libelle="Super administrateurs"
          valeur={String(etat.administrateurs.filter((a) => a.niveau === 'super').length)}
          precision="voient cette console"
          icone="shield-check"
        />
      </div>

      <Carte className="divide-y divide-hairline">
        {etat.administrateurs.map((a) => {
          const cestMoi = a.user_id === etat.appelant;
          return (
            <div
              key={a.user_id}
              data-testid={`admin-${a.user_id}`}
              className="p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="font-body font-semibold text-ink truncate">
                  {a.nom}
                  {cestMoi && (
                    <span className="ml-2 px-2 py-0.5 rounded-pill bg-secondary text-secondary-foreground text-xs font-semibold">
                      C'est toi
                    </span>
                  )}
                </p>
                <p className="font-body text-sm text-muted-foreground">
                  {a.niveau === 'super' ? 'Super administrateur' : 'Administrateur'}
                  {' · '}
                  {a.telephone ?? 'sans téléphone'}
                  {' · '}
                  depuis le {dateLisible(a.ajoute_le)}
                  {a.ajoute_par && `, ajouté par ${nomDe.get(a.ajoute_par) ?? 'un compte retiré'}`}
                </p>
              </div>

              {/* Aucun bouton sur sa propre ligne : le serveur refuse toute
                  action d'un compte sur lui-même — c'est ce qui garantit qu'il
                  reste toujours un super administrateur — et proposer le clic
                  reviendrait à promettre un geste impossible. */}
              {!cestMoi && (
                <div className="flex gap-2 flex-shrink-0">
                  {a.niveau === 'admin' ? (
                    <Bouton
                      variante="contour"
                      disabled={occupe}
                      onClick={() => onDefinir(a.user_id, 'super')}
                    >
                      Promouvoir
                    </Bouton>
                  ) : (
                    <Bouton
                      variante="contour"
                      disabled={occupe}
                      onClick={() => onDefinir(a.user_id, 'admin')}
                    >
                      Rétrograder
                    </Bouton>
                  )}
                  <Bouton
                    variante="fantome"
                    disabled={occupe}
                    onClick={() => onRevoquer(a.user_id)}
                  >
                    Révoquer
                  </Bouton>
                </div>
              )}
            </div>
          );
        })}
      </Carte>
    </section>
  );
}
