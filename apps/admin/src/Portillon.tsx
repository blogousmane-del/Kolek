import { Bouton, EcranMessage } from '@kolek/ui';
import { useEffect, useState } from 'react';

import { Coquille } from './Coquille';
import { supabase } from './supabase';

type Etat = 'verification' | 'admin' | 'refuse' | 'indisponible';

/**
 * Une session valide ne suffit pas à entrer : un collecteur possède des
 * identifiants Kolek parfaitement légitimes, et n'a rien à faire ici.
 *
 * La réponse vient de `est_admin()`, une fonction serveur qui n'ouvre aucune
 * ligne d'`admins` — c'est un portillon, pas un accès aux données. La vue
 * globale du dashboard passe toujours par les Edge Functions (spec §5.3).
 *
 * En cas d'erreur réseau, l'état est `indisponible`, jamais `admin` : un
 * portillon qui s'ouvre quand il ne sait pas n'est pas un portillon.
 *
 * ## La seconde question ne ferme rien
 *
 * `est_super_admin()` part en même temps, et son verdict n'a pas le poids du
 * premier : il ajoute une entrée de menu, rien de plus. Une panne sur elle
 * laisse donc entrer sans accorder le niveau — refuser tout le Dashboard
 * punirait l'administrateur métier pour une fonction qui ne le concerne pas.
 *
 * Ce niveau n'est pas une protection. Les deux Edge Functions du Super Admin
 * redemandent `est_super_admin()` avec le jeton de l'appelant, et la base ne
 * croit que celui-là. Ici, il décide de ce que le menu montre.
 *
 * Les deux réponses sont attendues ensemble : ouvrir sur le menu court puis y
 * greffer l'entrée une fraction de seconde plus tard ferait bouger le menu sous
 * le curseur.
 */
export function Portillon() {
  const [etat, setEtat] = useState<Etat>('verification');
  const [estSuper, setEstSuper] = useState(false);

  useEffect(() => {
    let vivant = true;

    // Enveloppe `try` et non `.catch()` : le constructeur de requête de
    // supabase-js est un « thenable », pas une Promise.
    void (async () => {
      try {
        const [porte, niveau] = await Promise.all([
          supabase.rpc('est_admin'),
          // Rattrapée ici et pas dans le `try` commun : un jet sur le niveau ne
          // doit pas être lu comme un jet sur la porte.
          Promise.resolve(supabase.rpc('est_super_admin')).then(
            (r) => r,
            () => ({ data: null, error: true }),
          ),
        ]);
        if (!vivant) return;
        setEstSuper(!niveau.error && niveau.data === true);
        setEtat(porte.error ? 'indisponible' : porte.data === true ? 'admin' : 'refuse');
      } catch {
        if (vivant) setEtat('indisponible');
      }
    })();

    return () => {
      vivant = false;
    };
  }, []);

  if (etat === 'verification') return null;
  if (etat === 'admin') return <Coquille estSuper={estSuper} />;

  return (
    <EcranMessage
      titre={etat === 'refuse' ? 'Accès réservé' : 'Vérification impossible'}
      message={
        etat === 'refuse'
          ? 'Ce compte n’est pas un compte d’administration GTCS. Les collecteurs utilisent l’application Kolek, pas ce tableau de bord.'
          : 'Impossible de vérifier tes droits d’accès. Vérifie le réseau et réessaie.'
      }
    >
      {etat === 'indisponible' && (
        <Bouton pleineLargeur onClick={() => window.location.reload()}>
          Réessayer
        </Bouton>
      )}
      <Bouton variante="fantome" pleineLargeur onClick={() => void supabase.auth.signOut()}>
        Se déconnecter
      </Bouton>
    </EcranMessage>
  );
}
